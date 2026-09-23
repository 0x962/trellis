import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import type { RetainOptions } from "./retainExited.ts";
import { sessionFiles } from "./sessionFiles.ts";
import { SessionStore } from "./sessionStore.ts";

let home: string;
const keepEverything: RetainOptions = {
	retentionMs: Number.MAX_SAFE_INTEGER,
	maxExitedRecords: Number.MAX_SAFE_INTEGER,
	maxExitedBytes: Number.MAX_SAFE_INTEGER,
	maxResumableRecords: Number.MAX_SAFE_INTEGER,
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "trellis-store-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

// Writes the file of one session that exited, without its output, its input
// or its provider events.
const seedExit = (id: string) => {
	const session: RuntimeSession = {
		id,
		daemonId: "test",
		pid: null,
		mode: "stdio",
		status: "exited",
		startedAt: "2026-09-23T10:00:00.000Z",
		endedAt: "2026-09-23T10:01:00.000Z",
		exitCode: 0,
		error: null,
	};
	writeFileSync(
		sessionFiles(home, id).session,
		JSON.stringify({ session, fingerprint: "fingerprint", identity: null, launch: null }),
	);
};

const exitCount = 3000;
const seedExits = () => {
	for (let index = 0; index < exitCount; index++) seedExit(`exit-${String(index).padStart(5, "0")}`);
};

test("a read that names no status passes over every confirmed exit", () => {
	seedExits();
	const store = new SessionStore(home, "test", keepEverything);
	// A record the store must open to answer has no file left, so an answer at
	// all proves the read opened none of them.
	for (let index = 0; index < exitCount; index++)
		rmSync(sessionFiles(home, `exit-${String(index).padStart(5, "0")}`).session);
	const started = Date.now();
	expect(store.list()).toEqual([]);
	expect(Date.now() - started).toBeLessThan(2000);
	store.closeWatchers();
});

test("a read that asks for the exits opens them", () => {
	seedExit("one");
	const store = new SessionStore(home, "test", keepEverything);
	expect(store.list({ status: "exited" }).map((session) => session.id)).toEqual(["one"]);
	store.closeWatchers();
});

test("the store keeps its exits inside the count it is given", () => {
	seedExits();
	const store = new SessionStore(home, "test", { ...keepEverything, maxExitedRecords: 50 });
	expect([...store.entries({ status: "exited" })]).toHaveLength(50);
	store.closeWatchers();
});
