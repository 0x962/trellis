import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { inspectProcess } from "../inspectProcess.ts";
import { SessionStore } from "../sessionStore.ts";

const home = mkdtempSync(join(tmpdir(), "trellis-idle-process-test-"));
const underIdleTimeoutMs = 5 * 60 * 1000;
const idleTimeoutMs = 30 * 60 * 1000;
const store = new SessionStore(home, "test");
let restored: SessionStore | undefined;
try {
	const parent = store.start({
		id: "idle-process",
		command: process.execPath,
		args: [
			"-e",
			`const child = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" }); console.log(child.pid); setInterval(() => {}, 1000);`,
		],
		cwd: home,
		mode: "stdio",
		env: { TRELLIS_ATTEMPT_TOKEN: "token" },
	});
	let childPid = 0;
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline && !childPid) {
		childPid = Number(store.outputBytes(parent.id, 0).data.toString().trim());
		if (!childPid) await delay(10);
	}
	assert(childPid > 0);
	assert.equal(inspectProcess(childPid).kind, "live");
	store.observe({
		id: parent.id,
		token: "token",
		event: { kind: "prompt", sessionId: "provider-conversation", prompt: `trellis-message:${parent.id}\nTask` },
	});
	store.observe({
		id: parent.id,
		token: "token",
		event: { kind: "idle", outcome: "completed", result: "Saved answer" },
	});
	let idleAt = Date.parse(store.inspect(parent.id).activity!.updatedAt);
	store.expireIdle(idleAt + underIdleTimeoutMs);
	assert.equal(store.inspect(parent.id).status, "running");
	store.registerNativeDelivery({ id: parent.id, token: "token", messageId: "queued", promptDigest: "digest" });
	// registerNativeDelivery records an unread message. expireIdleSessions keeps the process active until the provider acknowledges that message.
	store.expireIdle(idleAt + idleTimeoutMs + 1);
	assert.equal(store.inspect(parent.id).status, "running");
	store.observe({ id: parent.id, token: "token", event: { kind: "prompt", prompt: "trellis-message:queued\nNext" } });
	store.observe({
		id: parent.id,
		token: "token",
		event: { kind: "idle", outcome: "completed", result: "Saved answer" },
	});
	idleAt = Date.parse(store.inspect(parent.id).activity!.updatedAt);
	store.expireIdle(idleAt + idleTimeoutMs);
	assert.equal(store.inspect(parent.id).status, "running");
	store.expireIdle(idleAt + idleTimeoutMs + 1);
	assert.throws(
		() =>
			store.registerNativeDelivery({ id: parent.id, token: "token", messageId: "late-native", promptDigest: "digest" }),
		{ code: "SESSION_IDLE_STOPPED" },
	);
	assert.equal(store.hasMessage({ id: parent.id, messageId: "late-native" }).delivered, false);
	await assert.rejects(store.deliver(parent.id, "late-terminal", Buffer.from("Next task").toString("base64")), {
		code: "SESSION_IDLE_STOPPED",
	});
	const exitedBy = Date.now() + 5000;
	while (Date.now() < exitedBy && store.inspect(parent.id).status !== "exited") await delay(10);
	const stopped = store.inspect(parent.id);
	assert.equal(stopped.status, "exited");
	assert.equal(stopped.stopReason, "idle");
	assert.equal(stopped.error, null);
	assert.equal(stopped.exitCode, 0);
	assert.equal(inspectProcess(parent.pid!).kind, "missing");
	assert.equal(inspectProcess(childPid).kind, "missing");
	store.closeWatchers();
	restored = new SessionStore(home, "restart", {
		retentionMs: 0,
		maxExitedRecords: 0,
		maxExitedBytes: 0,
		maxResumableRecords: 500,
	});
	assert.equal(restored.inspect(parent.id).agent!.sessionId, "provider-conversation");
	assert.equal(restored.inspect(parent.id).result!.text, "Saved answer");
} finally {
	await store.stopAll();
	store.closeWatchers();
	restored?.closeWatchers();
	rmSync(home, { recursive: true, force: true });
}
