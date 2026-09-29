import { expect, test } from "bun:test";
import { executionViewV1Example } from "@trellis/api";
import { run } from "../../index.ts";
import { fixture, legacyRun, startReply } from "./testFixture/testFixture.ts";

const starts = [
	["flow", "start", "review", "--diff", "example/app#1"],
	["flows", "run", "example/app#1", "--flow", "review"],
];

test("canonical and saved starts retain reused IDs, JSON, and no-wait", async () => {
	for (const args of starts) {
		const f = fixture((call) => (call.path === "/rpc/flowExecutions/start" ? legacyRun : startReply(call)));
		expect(await run([...args, "--no-wait", "--json"], f.deps)).toBe(0);
		expect(JSON.parse(f.text())).toEqual(legacyRun);
		expect(f.sleeps).toEqual([]);
		const calls = f.calls.filter((call) => call.path === "/rpc/flowExecutions/start");
		expect(calls).toHaveLength(1);
		expect(calls[0]!.input).toEqual({
			flow: "review",
			ticket: "TRL-1",
			diffId: legacyRun.diffId,
			headSha: legacyRun.headSha,
			expectedVersion: 2,
			requestId: expect.any(String),
		});
	}
});

test("a server execution-error retry retains its repeatOf and sends no repeat override", async () => {
	const retried = { ...legacyRun, id: "00000000000000000000000009", repeatOf: legacyRun.id };
	const f = fixture((call) => (call.path === "/rpc/flowExecutions/start" ? retried : startReply(call)));
	expect(await run([...starts[0]!, "--no-wait", "--json"], f.deps)).toBe(0);
	expect(JSON.parse(f.text())).toEqual(retried);
	expect(f.calls.find((call) => call.path === "/rpc/flowExecutions/start")!.input).not.toHaveProperty("allowRepeat");
});

test("explicit repeats keep the reason", async () => {
	const f = fixture((call) => (call.path === "/rpc/flowExecutions/start" ? legacyRun : startReply(call)));
	expect(await run([...starts[0]!, "--no-wait", "--allow-repeat", "--reason", "User requested it."], f.deps)).toBe(0);
	expect(f.calls.find((call) => call.path === "/rpc/flowExecutions/start")!.input).toMatchObject({
		allowRepeat: true,
		repeatReason: "User requested it.",
	});
});

test("local timeout uses five-second polls and sends no cancel", async () => {
	const f = fixture((call) => (call.path.startsWith("/rpc/flowExecutions/") ? legacyRun : startReply(call)));
	expect(await run([...starts[0]!, "--timeout", "0.2", "--json"], f.deps)).toBe(1);
	expect(f.sleeps).toEqual([5000, 5000, 2000]);
	expect(f.calls.filter((call) => call.path === "/rpc/flowExecutions/get")).toHaveLength(2);
	expect(f.calls.some((call) => call.path.endsWith("/cancel"))).toBe(false);
	expect(JSON.parse(f.text())).toEqual(legacyRun);
});

test("the default local deadline is sixty minutes", async () => {
	const f = fixture((call) => (call.path.startsWith("/rpc/flowExecutions/") ? legacyRun : startReply(call)));
	expect(await run([...starts[0]!, "--json"], f.deps)).toBe(1);
	expect(f.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(60 * 60_000);
});

test("finite positive timeout values have no arbitrary ceiling", async () => {
	for (const timeout of ["0.001", "1000000", "1e300"]) {
		const done = { ...legacyRun, state: { ...legacyRun.state, status: "succeeded" } };
		const f = fixture((call) => (call.path === "/rpc/flowExecutions/start" ? done : startReply(call)));
		expect(await run([...starts[0]!, "--timeout", timeout, "--json"], f.deps)).toBe(0);
	}
	for (const timeout of ["0", "-1", "Infinity", "NaN", "bad"]) {
		const f = fixture(startReply);
		expect(await run([...starts[0]!, "--timeout", timeout], f.deps)).toBe(2);
		expect(f.calls).toEqual([]);
	}
});

test("a human wait keeps waiting in JSON and gives no success text", async () => {
	const waiting = { ...legacyRun, state: { ...legacyRun.state, status: "waiting" } };
	for (const flags of [["--json"], []]) {
		const f = fixture((call) => (call.path === "/rpc/flowExecutions/start" ? waiting : startReply(call)), true);
		expect(await run([...starts[0]!, ...flags], f.deps)).toBe(0);
		expect(f.sleeps).toEqual([]);
		expect(f.text()).not.toContain("succeeded");
		if (flags.length) expect(JSON.parse(f.text()).state.status).toBe("waiting");
		else expect(f.text()).toContain("waits for a person");
	}
});

test("an unavailable engine error reaches stderr without another start", async () => {
	const f = fixture((call) =>
		call.path === "/rpc/flowExecutions/start"
			? Response.json(
					{
						json: {
							defined: true,
							code: "RUNNER_UNAVAILABLE",
							status: 503,
							message: "The engine is unavailable.",
							data: { reason: "offline" },
						},
					},
					{ status: 503, headers: { "x-trellis-api-version": "1" } },
				)
			: startReply(call),
	);
	expect(await run([...starts[0]!], f.deps)).toBe(6);
	expect(f.errors()).toContain("The engine is unavailable.");
	expect(f.calls.filter((call) => call.path === "/rpc/flowExecutions/start")).toHaveLength(1);
});

test("both run-list spellings read beyond 501 results without losing IDs", async () => {
	const records = Array.from({ length: 1002 }, (_, index) => ({ ...legacyRun, id: String(index).padStart(26, "0") }));
	for (const args of [
		["flow", "run", "list", "--diff", "example/app#1"],
		["flows", "runs", "example/app#1"],
	]) {
		const f = fixture((call) =>
			call.path === "/rpc/flowDocumentsV1/list"
				? records
						.slice(Number(call.input.offset), Number(call.input.offset) + Number(call.input.limit))
						.map(({ id }) => ({ id, engine: "legacy" }))
				: call.path === "/rpc/flowExecutions/get"
					? records.find(({ id }) => id === call.input.id)
					: startReply(call),
		);
		expect(await run([...args, "--json"], f.deps)).toBe(0);
		expect(JSON.parse(f.text())).toEqual(records);
		expect(f.calls.filter((call) => call.path === "/rpc/flowDocumentsV1/list").map((call) => call.input)).toEqual(
			[0, 500, 1000].map((offset) => ({ diffId: legacyRun.diffId, offset, limit: 500 })),
		);
	}
});

test("flow discovery preserves project and ticket filters for both spellings", async () => {
	for (const command of ["flow", "flows"]) {
		const f = fixture(() => []);
		expect(await run([command, "list", "--project", "TRL", "--ticket", "TRL-1", "--json"], f.deps)).toBe(0);
		expect(f.calls).toEqual([{ path: "/rpc/flows/list", input: { project: "TRL", ticket: "TRL-1" } }]);
	}
});

test("run filters survive pagination and run show preserves JSON", async () => {
	const f = fixture(() => []);
	expect(await run(["flow", "run", "list", "--ticket", "TRL-1", "--flow", "review", "--json"], f.deps)).toBe(0);
	expect(f.calls).toEqual([
		{ path: "/rpc/flowDocumentsV1/list", input: { ticket: "TRL-1", flow: "review", offset: 0, limit: 500 } },
	]);
	const show = fixture((call) =>
		call.path === "/rpc/flowDocumentsV1/view" ? { ...executionViewV1Example, engine: "legacy" } : legacyRun,
	);
	expect(await run(["flow", "run", "show", legacyRun.id, "--json"], show.deps)).toBe(0);
	expect(JSON.parse(show.text())).toEqual(legacyRun);
	expect(show.calls.map((call) => call.path)).toEqual(["/rpc/flowDocumentsV1/view", "/rpc/flowExecutions/get"]);
});
