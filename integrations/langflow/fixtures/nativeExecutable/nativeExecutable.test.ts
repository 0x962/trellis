import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { HarnessHost } from "../../../../apps/server/src/agents/harnessHost/harnessHost.ts";
import { requestCodex } from "../../../../apps/server/src/agents/harnesses/codex/requestCodex.ts";
import { RuntimeClient } from "../../../../packages/runtime-protocol/src/client.ts";
import { cleanupNativeExecutable } from "./cleanup/cleanup.ts";
import { openNetworkControls } from "./networkControls/networkControls.ts";
import { prepareNativeExecutable } from "./setup/setup.ts";

const InputSchema = z.strictObject({
	root: z.string().startsWith("/"),
	runtimeHome: z.string().startsWith("/"),
	runtimeSocket: z.string().startsWith("/"),
	bun: z.string().startsWith("/"),
	requestTimeoutMs: z.number().int().positive(),
	observationTimeoutMs: z.number().int().positive(),
});

test("the real runtime observes deterministic prompts, results, resume, interruption, and exit", async () => {
	const input = InputSchema.parse(await Bun.file(process.env.TRELLIS_NATIVE_FIXTURE_TEST_INPUT!).json());
	const runtimeHome = await realpath(input.runtimeHome);
	const socket = await realpath(input.runtimeSocket);
	if (!socket.startsWith(`${runtimeHome}/`)) throw new Error("The supplied socket is outside the isolated runtime home");
	const controls = await openNetworkControls(input.requestTimeoutMs);
	let setup: Awaited<ReturnType<typeof prepareNativeExecutable>> | undefined;
	const attempts: string[] = [];
	try {
		setup = await prepareNativeExecutable({ root: input.root, bun: input.bun, plan: {
			schemaVersion: 1,
			requestTimeoutMs: input.requestTimeoutMs,
			denialPorts: controls.ports,
			turns: [
				{ marker: "fixture:complete-one", mode: "complete", result: "native-result-one" },
				{ marker: "fixture:hold", mode: "hold", result: "" },
				{ marker: "fixture:complete-two", mode: "complete", result: "native-result-two" },
			],
		} });
		const runtime = new RuntimeClient(socket, input.requestTimeoutMs);
		const host = new HarnessHost({
			runtime,
			directory: join(setup.root, "attempts"),
			agentsDirectory: join(setup.root, "agents"),
			env: setup.environment,
			bun: setup.bun,
			observationTimeoutMs: input.observationTimeoutMs,
			confirmationLimitMs: input.observationTimeoutMs,
		});
		const firstId = randomUUID();
		attempts.push(firstId);
		const first = await host.start({ id: firstId, harness: "codex", cwd: join(setup.root, "workspace"), prompt: "fixture:complete-one" });
		expect(first.process.pid).not.toBeNull();
		const completed = await host.waitFor(firstId, (state) => state.result?.text === "native-result-one");
		expect(completed.acknowledgedMessageIds).toContain(firstId);
		const sessionId = completed.agent!.sessionId!;
		const descriptor = JSON.parse(await readFile(join(setup.root, "attempts", firstId, "launch.json"), "utf8"));
		await expect(requestCodex(descriptor.spec.env.TRELLIS_CODEX_CONTROL_SOCKET, "incorrect-fixture-token", "/prompt", { sessionId, prompt: "fixture:hold" })).rejects.toMatchObject({ code: "Unauthorized" });
		await expect(requestCodex(descriptor.spec.env.TRELLIS_CODEX_CONTROL_SOCKET, descriptor.spec.env.TRELLIS_CODEX_CONTROL_TOKEN, "/prompt", { sessionId: "wrong-session", prompt: "fixture:hold" })).rejects.toMatchObject({ code: "STALE_SESSION" });
		const messageId = randomUUID();
		await host.send(firstId, "fixture:hold", messageId);
		const held = await host.waitFor(firstId, (state) => state.activity?.state === "working");
		expect(held.acknowledgedMessageIds).toContain(messageId);
		await expect(requestCodex(descriptor.spec.env.TRELLIS_CODEX_CONTROL_SOCKET, descriptor.spec.env.TRELLIS_CODEX_CONTROL_TOKEN, "/interrupt", { sessionId, turnId: "wrong-turn" })).rejects.toMatchObject({ code: "STALE_TURN" });
		const interrupted = await host.interrupt(firstId);
		expect(interrupted.agent?.outcome).toBe("interrupted");
		const firstExit = await host.stop(firstId);
		expect(firstExit.status).toBe("exited");
		const secondId = randomUUID();
		attempts.push(secondId);
		await host.resume({ id: secondId, harness: "codex", cwd: join(setup.root, "workspace"), prompt: "fixture:complete-two", sessionId });
		const resumed = await host.waitFor(secondId, (state) => state.result?.text === "native-result-two");
		expect(resumed.agent?.sessionId).toBe(sessionId);
		expect(resumed.acknowledgedMessageIds).toContain(secondId);
		const saved = JSON.parse(await readFile(join(setup.root, "sessions", `${sessionId}.json`), "utf8"));
		expect(saved.sequence).toBe(3);
		expect(controls.receipts.map((entry) => entry.positiveConnections)).toEqual([1, 1]);
		await writeFile(join(setup.root, "evidence/native-runtime.json"), JSON.stringify({
			scope: "real HarnessHost/runtime with deterministic bridge; no provider proof",
			runtime: await runtime.hello(),
			sessionId,
			attempts: [{ id: firstId, pid: first.process.pid, exitCode: firstExit.exitCode }, { id: secondId, pid: resumed.pid }],
			positiveControls: controls.receipts,
			resultAssertions: ["native-result-one", "native-result-two"],
			composedHttpAccountSelection: "not exercised",
		}), { mode: 0o600 });
	} finally {
		try {
			if (setup) await cleanupNativeExecutable({ root: setup.root, runtimeSocket: socket, attemptDirectory: join(setup.root, "attempts"), attemptIds: attempts, requestTimeoutMs: input.requestTimeoutMs });
		} finally {
			await controls.close();
		}
	}
}, 120_000);
