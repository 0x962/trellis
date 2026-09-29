import { expect, test } from "bun:test";
import { executionViewV1Example, legacyDocumentV1Example } from "@trellis/api";
import { run } from "../../index.ts";
import { fixture, legacyRun, startReply } from "./testFixture/testFixture.ts";

const starts = [
	["flow", "start", "review", "--diff", "example/app#1"],
	["flows", "run", "example/app#1", "--flow", "review"],
];
const startPath = "/rpc/flowExecutionsV1/start";
const args = [...starts[0]!, "--format-version", "1", "--json"];
const errorResponse = (code: string, status: number, data?: unknown) =>
	Response.json(
		{
			json: { defined: true, code, status, message: "The host cannot start this run.", data },
		},
		{ status, headers: { "x-trellis-api-version": "1" } },
	);

test("both versioned starts retain IDs, repeat reasons, and no-wait JSON", async () => {
	for (const start of starts) {
		const f = fixture((call) => (call.path === startPath ? executionViewV1Example : startReply(call)));
		expect(
			await run(
				[...start, "--format-version", "1", "--no-wait", "--allow-repeat", "--reason", "User requested it.", "--json"],
				f.deps,
			),
		).toBe(0);
		expect(JSON.parse(f.text())).toEqual(executionViewV1Example);
		expect(f.sleeps).toEqual([]);
		expect(f.calls.filter((call) => call.path === startPath)).toHaveLength(1);
		expect(f.calls.find((call) => call.path === startPath)!.input).toMatchObject({
			flow: "review",
			ticket: "TRL-1",
			diffId: legacyRun.diffId,
			headSha: legacyRun.headSha,
			expectedVersion: 2,
			requestId: expect.any(String),
			allowRepeat: true,
			repeatReason: "User requested it.",
		});
		expect(f.calls.some((call) => call.path === "/rpc/flowExecutions/start")).toBe(false);
	}
});

test("a versioned reused legacy outcome retains legacy JSON", async () => {
	const { publication: _publication, lastExecutablePublication: _last, ...snapshot } = legacyDocumentV1Example;
	const view = { ...executionViewV1Example, engine: "legacy", snapshot, publication: null, submission: null };
	const f = fixture((call) =>
		call.path === startPath ? view : call.path === "/rpc/flowExecutions/get" ? legacyRun : startReply(call),
	);
	expect(await run([...args, "--no-wait"], f.deps)).toBe(0);
	expect(JSON.parse(f.text())).toEqual(legacyRun);
	expect(f.calls.filter((call) => call.path === "/rpc/flowExecutions/get").map((call) => call.input)).toEqual([
		{ id: view.id },
	]);
});

test("execution-error retry identity comes from the versioned receipt", async () => {
	const view = { ...executionViewV1Example, id: "00000000000000000000000009", repeatOf: executionViewV1Example.id };
	const f = fixture((call) => (call.path === startPath ? view : startReply(call)));
	expect(await run([...args, "--no-wait"], f.deps)).toBe(0);
	expect(JSON.parse(f.text())).toEqual(view);
	expect(f.calls.find((call) => call.path === startPath)!.input).not.toHaveProperty("allowRepeat");
});

test("native and unknown waits poll every five seconds and time out without cancel", async () => {
	for (const detail of ["waiting_native", "unknown"] as const) {
		const view = { ...executionViewV1Example, status: "waiting", detail };
		const f = fixture((call) =>
			[startPath, "/rpc/flowDocumentsV1/view"].includes(call.path) ? view : startReply(call),
		);
		expect(await run([...args, "--timeout", "0.2"], f.deps)).toBe(1);
		expect(f.sleeps).toEqual([5000, 5000, 2000]);
		expect(JSON.parse(f.text())).toEqual(view);
		expect(f.calls.filter((call) => call.path === "/rpc/flowDocumentsV1/view").map((call) => call.input)).toEqual([
			{ id: view.id },
			{ id: view.id },
		]);
		expect(f.calls.some((call) => call.path.includes("cancel"))).toBe(false);
	}
});

test("a human wait ends the local wait without success text", async () => {
	const view = { ...executionViewV1Example, status: "waiting", detail: "waiting_human" };
	const f = fixture((call) => (call.path === startPath ? view : startReply(call)), true);
	expect(await run([...starts[0]!, "--format-version", "1"], f.deps)).toBe(0);
	expect(f.sleeps).toEqual([]);
	expect(f.text()).toContain("waits for a person");
	expect(f.text()).not.toContain("succeeded");
});

test("an unavailable runtime or handler never selects a legacy mutation", async () => {
	for (const [code, status, exit] of [
		["FLOW_RUNTIME_UNAVAILABLE", 503, 6],
		["FLOW_RECOVERY_BLOCKED", 409, 4],
		["NOT_FOUND", 404, 3],
	] as const) {
		const f = fixture((call) => (call.path === startPath ? errorResponse(code, status) : startReply(call)));
		expect(await run(args, f.deps)).toBe(exit);
		expect(f.errors()).toContain(code);
		expect(f.calls.filter((call) => call.path === startPath)).toHaveLength(1);
		expect(f.calls.some((call) => call.path === "/rpc/flowExecutions/start")).toBe(false);
	}
});

test("unsupported request versions stop before any HTTP request", async () => {
	for (const version of ["0", "2", "future"]) {
		const f = fixture(startReply);
		expect(await run([...starts[0]!, "--format-version", version], f.deps)).toBe(2);
		expect(f.calls).toEqual([]);
	}
});

test("unsupported response versions fail without a second mutation", async () => {
	const f = fixture((call) =>
		call.path === startPath ? { ...executionViewV1Example, schemaVersion: 2 } : startReply(call),
	);
	expect(await run(args, f.deps)).toBe(4);
	expect(f.errors()).toContain("FLOW_UNSUPPORTED_FORMAT");
	expect(f.calls.filter((call) => call.path === startPath)).toHaveLength(1);
});

test("versioned polls preserve the execution ID through completion", async () => {
	const done = { ...executionViewV1Example, status: "succeeded", detail: "completed" };
	const f = fixture((call) =>
		call.path === startPath
			? executionViewV1Example
			: call.path === "/rpc/flowDocumentsV1/view"
				? done
				: startReply(call),
	);
	expect(await run(args, f.deps)).toBe(0);
	expect(f.sleeps).toEqual([5000]);
	expect(JSON.parse(f.text())).toEqual(done);
});

test("format diagnostics retain the supported endpoint without a second start", async () => {
	const data = {
		flowId: executionViewV1Example.flowId,
		engine: "langflow",
		schemaVersion: 2,
		operation: "write",
		supportedEndpoint: "/api/flows/review/document-v1",
		diagnostics: [{ code: "unsupported", message: "Read the saved document.", severity: "error", path: [] }],
	};
	const f = fixture((call) =>
		call.path === startPath ? errorResponse("FLOW_UNSUPPORTED_FORMAT", 422, data) : startReply(call),
	);
	expect(await run(args, f.deps)).toBe(4);
	expect(f.errors()).toContain(data.supportedEndpoint);
	expect(f.errors()).toContain("Read the saved document.");
	expect(f.calls.filter((call) => call.path === startPath)).toHaveLength(1);
});
