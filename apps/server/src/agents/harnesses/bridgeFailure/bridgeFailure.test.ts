import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessEvent, RuntimeRequest } from "@trellis/runtime-protocol";

// A bridge that stops must say why. These tests run the real bridge entry
// files against a runtime socket that refuses a write, and they read the
// error event that the bridge sends before it exits.
const TIMEOUT_MESSAGE = "Runtime observe response is unknown: request timed out";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const pathFromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// A runtime socket that answers `observe`. `refuse` names the events it
// rejects, and it answers those with `TIMEOUT_MESSAGE`, the text that a runtime
// under load really returns.
async function fakeRuntime(home: string, refuse: (event: HarnessEvent) => boolean) {
	const path = join(home, "runtime.sock");
	const observed: HarnessEvent[] = [];
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			// One chunk can carry several requests, or half of one. The socket
			// answers each complete line and keeps the rest.
			for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
				const request = JSON.parse(buffer.slice(0, end)) as RuntimeRequest;
				buffer = buffer.slice(end + 1);
				const { event } = request.params as { event: HarnessEvent };
				observed.push(event);
				const reply = refuse(event)
					? { id: request.id, error: { code: "unavailable", message: TIMEOUT_MESSAGE } }
					: { id: request.id, result: {} };
				socket.write(`${JSON.stringify(reply)}\n`);
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	cleanups.push(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	return { path, observed };
}

async function scratchHome() {
	const home = await mkdtemp(join(tmpdir(), "trellis-bridge-"));
	cleanups.push(() => rm(home, { recursive: true, force: true }));
	return home;
}

async function writeExecutable(path: string, body: string) {
	await writeFile(path, body, { mode: 0o755 });
	return path;
}

async function runBridge(entry: string, env: Record<string, string>, launch: Record<string, unknown>) {
	const child = Bun.spawn([process.execPath, pathFromHere(entry), JSON.stringify(launch)], {
		env: { PATH: process.env.PATH ?? "", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	return { exitCode, stderr };
}

async function runMuseBridge(refuse: (event: HarnessEvent) => boolean) {
	const home = await scratchHome();
	const runtime = await fakeRuntime(home, refuse);
	const executable = await writeExecutable(
		join(home, "muse"),
		`#!/bin/sh\nexec "${process.execPath}" "${pathFromHere("../muse/museHostFixture.ts")}" "$@"\n`,
	);
	const run = await runBridge(
		"../muse/bridgeEntry.ts",
		{
			TRELLIS_MUSE_EXECUTABLE: executable,
			TRELLIS_MUSE_CONTROL_SOCKET: join(home, "muse-control", "control.sock"),
			TRELLIS_MUSE_CONTROL_TOKEN: "control-token",
			TRELLIS_HARNESS_SOCKET: runtime.path,
			TRELLIS_ATTEMPT_ID: "attempt-1",
			TRELLIS_ATTEMPT_TOKEN: "attempt-token",
			TRELLIS_TEST_MUSE_HOME: home,
		},
		{ cwd: home, prompt: "do the work" },
	);
	return { ...run, observed: runtime.observed };
}

test("the Muse bridge records why it stopped after its event chain rejects", async () => {
	const run = await runMuseBridge((event) => event.kind === "message");
	expect(run.observed.map((event) => event.kind)).toEqual(["session", "prompt", "message", "error"]);
	expect(run.observed.at(-1)).toMatchObject({ kind: "error", outcome: "failed", error: TIMEOUT_MESSAGE });
	expect(run.exitCode).toBe(1);
});

test("the Muse bridge prints why it stopped when the runtime refuses that record too", async () => {
	const run = await runMuseBridge((event) => event.kind === "message" || event.kind === "error");
	expect(run.stderr).toContain(`The bridge stopped: ${TIMEOUT_MESSAGE}`);
	expect(run.stderr).toContain(`The bridge could not record that reason: ${TIMEOUT_MESSAGE}`);
	expect(run.exitCode).toBe(1);
});

test("the Codex bridge records why it stopped when its engine gives no app server", async () => {
	const home = await scratchHome();
	const runtime = await fakeRuntime(home, () => false);
	const engine = join(home, "codex-engine");
	// The stub writes a plain file where the app server socket belongs, so the
	// bridge finds the path and then fails to speak to it.
	const executable = await writeExecutable(
		join(home, "codex"),
		'#!/bin/sh\n: > "$TRELLIS_CODEX_ENGINE_SOCKET"\nsleep 30\n',
	);
	const run = await runBridge(
		"../codex/bridgeEntry.ts",
		{
			TRELLIS_CODEX_EXECUTABLE: executable,
			TRELLIS_CODEX_ENGINE_SOCKET: join(engine, "engine.sock"),
			TRELLIS_CODEX_CONTROL_SOCKET: join(home, "codex-control", "control.sock"),
			TRELLIS_CODEX_CONTROL_TOKEN: "control-token",
			TRELLIS_HARNESS_SOCKET: runtime.path,
			TRELLIS_ATTEMPT_ID: "attempt-1",
			TRELLIS_ATTEMPT_TOKEN: "attempt-token",
		},
		{ cwd: home, prompt: "do the work" },
	);
	expect(runtime.observed).toHaveLength(1);
	expect(runtime.observed[0]).toMatchObject({ kind: "error", outcome: "failed" });
	// The socket library writes this text, and its wording can change. The
	// test reads one keyword and not the full text.
	expect(runtime.observed[0]!.error).toMatch(/WebSocket|ENOTSOCK|connect/);
	expect(run.exitCode).toBe(1);
});
