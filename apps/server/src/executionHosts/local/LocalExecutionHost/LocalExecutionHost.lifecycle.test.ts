import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionTarget } from "@trellis/runtime-protocol/execution";
import { scriptedRuntime } from "@trellis/runtime-protocol/execution/contract-fixture";
import { attemptCapturePath } from "../../../services/agentRuns/attemptCapture.ts";
import { pauseRestartFixture } from "../../../services/agentRuns/pauseRestartFixture/pauseRestartFixture.ts";
import { createLocalExecutionHost } from "./LocalExecutionHost.ts";

const at = new Date("2026-10-01T12:00:00Z");
const target: ExecutionTarget = {
	hostId: "01HOSTLOCAL",
	controlId: "01CONTROL",
	controllerOwnerEpoch: 1,
	runId: "01RUN",
	attemptId: "01ATTEMPT",
	generation: 1,
};
const captured = Buffer.from("captured output\n");
const status = pauseRestartFixture(target.attemptId, at);

const home = await mkdtemp(join(tmpdir(), "trellis-lifecycle-"));
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
	env: async () => ({}),
});
afterAll(async () => {
	await runtime.close();
	await rm(home, { recursive: true, force: true });
});

test("a foreign target is refused before any request reaches the socket", async () => {
	const foreign = { ...target, controllerOwnerEpoch: 2 };
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
