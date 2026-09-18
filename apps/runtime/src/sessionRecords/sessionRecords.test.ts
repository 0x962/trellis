import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import { sessionFiles } from "../sessionFiles.ts";
import { SessionRecords } from "./sessionRecords.ts";

let home: string;
const day = 24 * 60 * 60 * 1000;
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "trellis-records-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));
const seed = (id: string, override: Partial<RuntimeSession> = {}) => {
	const session: RuntimeSession = {
		id,
		daemonId: "test",
		pid: null,
		mode: "stdio",
		status: "exited",
		startedAt: new Date().toISOString(),
		endedAt: new Date().toISOString(),
		exitCode: 0,
		error: null,
		...override,
	};
	writeFileSync(
		sessionFiles(home, id).session,
		JSON.stringify({
			session,
			fingerprint: "fingerprint",
			identity: null,
			launch: { command: "test", args: ["prompt"], cwd: home },
		}),
	);
	return session;
};
const restore = () => {
	const records = new SessionRecords(home);
	records.restore(() => {});
	return records;
};

test("restores exited history without resources or rewritten session files", () => {
	for (let index = 0; index < 40; index++) seed(`exit-${index}`);
	const before = readFileSync(sessionFiles(home, "exit-0").session, "utf8");
	const records = restore();
	expect([...records.values()]).toHaveLength(0);
	expect([...records.entries()]).toHaveLength(40);
	expect(readdirSync(home)).toHaveLength(40);
	expect(readFileSync(sessionFiles(home, "exit-0").session, "utf8")).toBe(before);
	const first = records.get("exit-0")!;
	for (let index = 1; index < 40; index++) records.get(`exit-${index}`);
	expect(records.get("exit-0")).not.toBe(first);
	expect([...records.values()]).toHaveLength(0);
});

test("retains subscribers and pending deliveries until both finish", () => {
	seed("active", { status: "running", endedAt: null });
	const records = restore();
	const record = records.get("active")!;
	expect(record.session.status).toBe("unknown");
	const listener = () => {};
	record.listeners.add(listener);
	const unpin = records.pin(record);
	record.tokenHash = Buffer.alloc(32, 7);
	record.activity = { state: "idle", updatedAt: "2026-01-01T00:00:00.000Z" };
	record.session.status = "exited";
	record.session.endedAt = new Date().toISOString();
	records.save(record);
	expect([...records.values()]).toHaveLength(1);
	record.listeners.delete(listener);
	records.release(record);
	expect(records.get("active")).toBe(record);
	unpin();
	expect([...records.values()]).toHaveLength(0);
	const reloaded = records.get("active")!;
	expect(reloaded).not.toBe(record);
	expect(reloaded.tokenHash).toEqual(Buffer.alloc(32, 7));
	expect(reloaded.activity).toEqual(record.activity);
	expect(readFileSync(sessionFiles(home, "active").session, "utf8")).not.toContain("tokenHash");
});

test("waits for retained output writes before releasing an exited record", async () => {
	seed("writing", { status: "running", endedAt: null });
	const records = restore();
	const record = records.get("writing")!;
	record.log.append(Buffer.alloc(1024 * 1024, 120));
	record.session.status = "exited";
	record.session.endedAt = new Date().toISOString();
	records.save(record);
	expect([...records.values()]).toHaveLength(1);
	await record.log.finish();
	records.release(record);
	expect([...records.values()]).toHaveLength(0);
	expect(records.get("writing")!.log.readBytes(0).data).toEqual(Buffer.alloc(65536, 120));
});

test("keeps seven-day history and protects subscribed old attempts", () => {
	const now = Date.now();
	seed("old", { endedAt: new Date(now - 8 * day).toISOString() });
	seed("recent", { endedAt: new Date(now - day).toISOString() });
	const records = restore();
	const old = records.get("old")!;
	const listener = () => {};
	old.listeners.add(listener);
	records.retain(old);
	records.removeExpired(now, { retentionMs: 7 * day, maxExitedRecords: 500 });
	expect(records.has("old")).toBe(true);
	old.listeners.delete(listener);
	records.release(old);
	records.removeExpired(now, { retentionMs: 7 * day, maxExitedRecords: 500 });
	expect(records.has("old")).toBe(false);
	expect(existsSync(sessionFiles(home, "old").session)).toBe(false);
	expect(records.has("recent")).toBe(true);
	expect(existsSync(sessionFiles(home, "recent").session)).toBe(true);
});

test("confirmed recovered exits retain their original unknown end time", () => {
	seed("recovered", { status: "unknown", endedAt: null });
	const records = restore();
	const record = records.get("recovered")!;
	records.finalize(record);
	expect([...records.values()]).toHaveLength(0);
	expect(records.get("recovered")!.session.endedAt).toBe(null);
	expect(records.get("recovered")!.session.status).toBe("unknown");
});

test("history cache eviction preserves the latest activity observation", () => {
	for (let index = 0; index < 10; index++) seed(`activity-${index}`);
	const records = restore();
	const record = records.get("activity-0")!;
	record.activity = { state: "idle", updatedAt: "2026-01-02T00:00:00.000Z" };
	for (let index = 1; index < 10; index++) records.get(`activity-${index}`);
	expect(records.get("activity-0")!.activity).toEqual(record.activity);
});

test("the retention count removes cold history and protects subscribed records", () => {
	const now = Date.now();
	for (let index = 0; index < 4; index++)
		seed(`count-${index}`, { endedAt: new Date(now - (index + 1) * day).toISOString() });
	const records = restore();
	const subscribed = records.get("count-3")!;
	const listener = () => {};
	subscribed.listeners.add(listener);
	records.retain(subscribed);
	const options = { retentionMs: 7 * day, maxExitedRecords: 2 };
	records.removeExpired(now, options);
	expect([...records.entries()].map(([id]) => id)).toEqual(["count-0", "count-1", "count-3"]);
	expect(existsSync(sessionFiles(home, "count-2").session)).toBe(false);
	subscribed.listeners.delete(listener);
	records.release(subscribed);
	records.removeExpired(now, options);
	expect([...records.entries()].map(([id]) => id)).toEqual(["count-0", "count-1"]);
});
