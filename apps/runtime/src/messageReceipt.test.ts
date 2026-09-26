import { afterEach, beforeEach, expect, test } from "bun:test";
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
