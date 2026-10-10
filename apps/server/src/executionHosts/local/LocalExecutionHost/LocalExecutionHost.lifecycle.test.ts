import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionTarget } from "@trellis/runtime-protocol/execution";
import { FIXTURE_AMBIENT, FIXTURE_BEARER, scriptedRuntime } from "@trellis/runtime-protocol/execution/contract-fixture";
import { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types.ts";
import { attemptCapturePath } from "../../../services/agentRuns/attemptCapture.ts";
import { pauseRestartFixture } from "../../../services/agentRuns/pauseRestartFixture/pauseRestartFixture.ts";
import { createLocalExecutionHost, type LocalDescriptor, type LocalPrepareInput } from "./LocalExecutionHost.ts";

const at = new Date("2026-10-01T12:00:00Z");
const target: ExecutionTarget = {
	hostId: "01HOSTLOCAL",
	controlId: "01CONTROL",
	controllerOwnerEpoch: 1,
	runId: "01RUN",
	attemptId: "01ATTEMPT",
	generation: 1,
};
const foreign = { ...target, controllerOwnerEpoch: 2 };
const captured = Buffer.from("captured output\n");
const status = pauseRestartFixture(target.attemptId, at);
// The record on disk holds the full environment of the process, the bearer
// among it. Every value that leaves the host must lose that environment.
const record: HarnessDescriptor = {
	harness: "pi",
	prompt: "Read the source",
	fingerprint: "fixture-fingerprint",
	spec: {
		id: target.attemptId,
		command: "/usr/local/bin/pi",
		args: [],
		cwd: "/nowhere",
		mode: "pty",
		env: { ...FIXTURE_AMBIENT, TRELLIS_ATTEMPT_TOKEN: "token" },
	},
};
const redacted: LocalDescriptor = {
	...record,
	spec: { id: target.attemptId, command: "/usr/local/bin/pi", args: [], cwd: "/nowhere", mode: "pty" },
};
// The input of `prepare.descriptor` and `launch.confirmed`. The host strips
// `account` and `sessionId` before the HarnessHost sees it.
const input: LocalPrepareInput = {
	id: target.attemptId,
	harness: "pi",
	cwd: "/nowhere",
	prompt: "Read the source",
	token: "token",
	account: null,
};
const { account: _account, ...launch } = input;

const home = await mkdtemp(join(tmpdir(), "trellis-lifecycle-"));
await mkdir(join(home, "harness-attempts", target.attemptId), { recursive: true });
await writeFile(join(home, "harness-attempts", target.attemptId, "launch.json"), JSON.stringify(record));
// The runtime answers the way it answers `stopNative` and `refreshNative`
// for a process that exited: the same status for inspect and stop, and the
// retained output in pages.
const runtime = await scriptedRuntime((request) => {
	const { offset } = request.params as { offset?: number };
	switch (request.method) {
		case "inspect":
		case "stop":
			return status;
		case "output": {
			const start = Math.min(offset!, captured.length);
			return {
				data: captured.subarray(start).toString("base64"),
				startOffset: start,
				nextOffset: captured.length,
				truncated: false,
			};
		}
		default:
			throw new Error(`Unscripted method ${request.method}`);
	}
});
const host = createLocalExecutionHost({
	binding: { hostId: target.hostId, controlId: target.controlId, controllerOwnerEpoch: 1 },
	home,
	localUrl: "http://127.0.0.1:1",
	connection: { socketPath: runtime.socketPath, client: () => runtime.client, ensure: async () => runtime.client },
	env: async () => FIXTURE_AMBIENT,
});
const spies: ReturnType<typeof spyOn>[] = [];
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});
afterAll(async () => {
	await runtime.close();
	await rm(home, { recursive: true, force: true });
});
const clean = (value: unknown) => {
	const text = JSON.stringify(value);
	expect(text).not.toContain("TRELLIS_AUTH_TOKEN");
	expect(text).not.toContain(FIXTURE_BEARER);
	expect(text).not.toContain(process.env.PATH!);
};

test("a foreign target is refused before any request reaches the socket", async () => {
	await expect(host.observe.inspect(foreign)).rejects.toMatchObject({ code: "EXECUTION_TARGET_MISMATCH" });
	await expect(host.stop.stop(foreign)).rejects.toMatchObject({ code: "EXECUTION_TARGET_MISMATCH" });
	expect(() => host.files.capturePath(foreign)).toThrow("names host");
	expect(runtime.requests).toHaveLength(0);
});

test("observe.inspect gives refreshNative the status of the runtime", async () => {
	expect(await host.observe.inspect(target)).toEqual(status);
	expect(runtime.requests.map((request) => request.method)).toEqual(["inspect"]);
});

test("stop.stop and transcript.readAll give stopNative the exit and the retained output", async () => {
	const stopped = await host.stop.stop(target);
	expect(stopped).toEqual(status);
	expect(stopped.status).toBe("exited");
	expect(await host.transcript.readAll(target)).toBe(captured.toString("utf8"));
	expect(runtime.requests.slice(1).map((request) => request.method)).toEqual(["stop", "output", "output"]);
	expect(runtime.requests[2]!.params).toEqual({
		id: target.attemptId,
		offset: Number.MAX_SAFE_INTEGER,
		stream: "stdout",
	});
	expect(runtime.requests[3]!.params).toEqual({ id: target.attemptId, offset: 0, stream: "stdout" });
});

test("files.captureExists and files.writeCapture use the capture file of the attempt", async () => {
	expect(host.files.capturePath(target)).toBe(attemptCapturePath(home, target.runId, target.attemptId));
	expect(await host.files.captureExists(target)).toBe(false);
	await host.files.writeCapture(target, captured.toString("utf8"));
	expect(await host.files.captureExists(target)).toBe(true);
	expect(await Bun.file(host.files.capturePath(target)).text()).toBe(captured.toString("utf8"));
});

test("files.descriptor and prepare.descriptor return the record without its environment", async () => {
	expect(await host.files.descriptor(target)).toEqual(redacted);
	const prepare = spyOn(HarnessHost.prototype, "prepare").mockResolvedValue(record);
	spies.push(prepare);
	const prepared = await host.prepare.descriptor(target, input);
	expect(prepared).toEqual(redacted);
	clean(prepared);
	expect(prepare).toHaveBeenCalledTimes(1);
	expect(prepare.mock.calls[0]).toEqual([launch, undefined]);
	await expect(host.prepare.descriptor(target, { ...input, id: "other" })).rejects.toMatchObject({
		code: "EXECUTION_SPEC_MISMATCH",
	});
	await expect(host.prepare.descriptor(foreign, input)).rejects.toMatchObject({ code: "EXECUTION_TARGET_MISMATCH" });
	expect(prepare).toHaveBeenCalledTimes(1);
});

test("launch.confirmed delegates to HarnessHost.start and HarnessHost.resume", async () => {
	const start = spyOn(HarnessHost.prototype, "start").mockResolvedValue({ process: status });
	const resume = spyOn(HarnessHost.prototype, "resume").mockResolvedValue({ process: status });
	spies.push(start, resume);
	const started = await host.launch.confirmed(target, input, { kind: "start" });
	expect(started).toEqual({ kind: "receipt", target, session: status, descriptorFingerprint: record.fingerprint });
	clean(started);
	expect(start.mock.calls).toEqual([[launch]]);
	const resumed = await host.launch.confirmed(target, input, { kind: "resume", sessionId: "provider-session" });
	expect(resumed.kind).toBe("receipt");
	expect(resume.mock.calls).toEqual([[{ ...launch, sessionId: "provider-session" }]]);
	await expect(host.launch.confirmed(foreign, input, { kind: "start" })).rejects.toMatchObject({
		code: "EXECUTION_TARGET_MISMATCH",
	});
	expect(start).toHaveBeenCalledTimes(1);
	expect(resume).toHaveBeenCalledTimes(1);
});

test("input.send, sendAtTurnBoundary and interrupt delegate to the HarnessHost", async () => {
	const send = spyOn(HarnessHost.prototype, "send").mockResolvedValue(status);
	const boundary = spyOn(HarnessHost.prototype, "sendAtTurnBoundary").mockResolvedValue(status);
	const interrupt = spyOn(HarnessHost.prototype, "interrupt").mockResolvedValue(status);
	spies.push(send, boundary, interrupt);
	const expected = { turnId: "turn", activityAt: at.toISOString() };
	expect(await host.input.send(target, "m1", "first text", expected)).toEqual(status);
	expect(send.mock.calls).toEqual([[target.attemptId, "first text", "m1", expected]]);
	expect(await host.input.sendAtTurnBoundary(target, "m2", "second text")).toEqual(status);
	expect(boundary.mock.calls).toEqual([[target.attemptId, "second text", "m2"]]);
	expect(await host.input.interrupt(target, { waitForIdle: false })).toEqual(status);
	expect(interrupt.mock.calls).toEqual([[target.attemptId, { waitForIdle: false }]]);
	for (const call of [
		() => host.input.send(foreign, "m", "x"),
		() => host.input.sendAtTurnBoundary(foreign, "m", "x"),
		() => host.input.interrupt(foreign),
	])
		await expect(call()).rejects.toMatchObject({ code: "EXECUTION_TARGET_MISMATCH" });
	expect(send).toHaveBeenCalledTimes(1);
	expect(boundary).toHaveBeenCalledTimes(1);
	expect(interrupt).toHaveBeenCalledTimes(1);
});
