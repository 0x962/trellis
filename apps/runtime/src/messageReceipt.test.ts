import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputLedger } from "./inputLedger.ts";
import { sessionFiles } from "./sessionFiles.ts";
import { SessionStore } from "./sessionStore.ts";

let home: string;
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "trellis-receipt-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test("an exited attempt distinguishes absent, uncertain, and delivered messages after restart", () => {
	const files = sessionFiles(home, "attempt");
	writeFileSync(
		files.session,
		JSON.stringify({
			session: {
				id: "attempt",
				daemonId: "test",
				pid: null,
				mode: "stdio",
				status: "exited",
				startedAt: new Date().toISOString(),
				endedAt: new Date().toISOString(),
				exitCode: 0,
				error: null,
			},
			fingerprint: "test",
			identity: null,
			launch: null,
		}),
	);
	const ledger = new InputLedger(files.input);
	const digest = createHash("sha256").update("message").digest("hex");
	ledger.registerNative("uncertain", digest, () => {});
	ledger.registerNative("accepted", digest, () => {});
	ledger.acknowledge("accepted");
	const store = new SessionStore(home, "test");
	expect(store.hasMessage({ id: "attempt", messageId: "absent" })).toEqual({
		messageId: "absent",
		registered: false,
		delivered: false,
		status: "exited",
	});
	expect(store.hasMessage({ id: "attempt", messageId: "uncertain" })).toEqual({
		messageId: "uncertain",
		registered: true,
		delivered: false,
		status: "exited",
	});
	expect(store.hasMessage({ id: "attempt", messageId: "accepted" })).toEqual({
		messageId: "accepted",
		registered: true,
		delivered: true,
		status: "exited",
	});
	store.closeWatchers();
});

test("a queued terminal message waits for the current turn to finish", async () => {
	const store = new SessionStore(home, "test");
	store.start({
		id: "attempt",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "stdio",
		env: { TRELLIS_ATTEMPT_TOKEN: "token" },
	});
	try {
		store.observe({ id: "attempt", token: "token", event: { kind: "working", turnId: "current" } });
		const data = Buffer.from("queued status\n").toString("base64");
		expect(await store.queueInput("attempt", "status-request", data)).toEqual({
			messageId: "status-request",
			status: "unknown",
		});
		expect(store.outputBytes("attempt", 0).data.toString()).not.toContain("queued status");

		store.observe({
			id: "attempt",
			token: "token",
			event: { kind: "idle", outcome: "completed", result: "Current work finished." },
		});
		for (let index = 0; index < 100; index++) {
			if (store.outputBytes("attempt", 0).data.toString().includes("queued status")) break;
			await Bun.sleep(20);
		}
		expect(store.outputBytes("attempt", 0).data.toString()).toBe("queued status\n");
		expect(await store.queueInput("attempt", "status-request", data)).toEqual({
			messageId: "status-request",
			status: "written",
		});
		expect(store.outputBytes("attempt", 0).data.toString()).toBe("queued status\n");
	} finally {
		await store.stopAll();
		store.closeWatchers();
	}
});

test("logs a queued input failure from both turn boundary paths", async () => {
	const store = new SessionStore(home, "test");
	store.start({
		id: "attempt",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "stdio",
		env: { TRELLIS_ATTEMPT_TOKEN: "token" },
	});
	const flush = spyOn(InputLedger.prototype, "flushQueuedInput").mockRejectedValue(new Error("terminal closed"));
	const error = spyOn(console, "error").mockImplementation(() => {});
	try {
		store.observe({ id: "attempt", token: "token", event: { kind: "working", turnId: "observed" } });
		await store.queueInput("attempt", "status-request", Buffer.from("status\n").toString("base64"));
		store.observe({ id: "attempt", token: "token", event: { kind: "idle", outcome: "completed" } });
		for (let index = 0; index < 100 && error.mock.calls.length < 1; index++) await Bun.sleep(1);

		store.turn({ id: "attempt", token: "token", event: "UserPromptSubmit" });
		store.turn({ id: "attempt", token: "token", event: "Stop" });
		for (let index = 0; index < 100 && error.mock.calls.length < 2; index++) await Bun.sleep(1);

		expect(error).toHaveBeenCalledTimes(2);
		expect(error.mock.calls).toEqual([
			[
				JSON.stringify({
					event: "queued input failed",
					sessionId: "attempt",
					messageId: "status-request",
					error: "terminal closed",
				}),
			],
			[
				JSON.stringify({
					event: "queued input failed",
					sessionId: "attempt",
					messageId: "status-request",
					error: "terminal closed",
				}),
			],
		]);
	} finally {
		flush.mockRestore();
		error.mockRestore();
		await store.stopAll();
		store.closeWatchers();
	}
});
