import { afterEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { holdSession } from "../../../agents/sessionOperation";
import { writeAttemptCapture } from "../../agentRuns/attemptCapture.ts";
import { getRun } from "../../agentRuns/queries.ts";
import { fixture, processStatus } from "./fixture/fixture.ts";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
const setup = async () => {
	const f = await fixture();
	fixtures.push(f);
	return f;
};
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});

test("default boundaries archive at three days and delete at seven days from activity", async () => {
	const f = await setup();
	const old = await f.add(3);
	const recent = await f.add(3 - 1 / 86400);
	expect(await f.run()).toEqual({ archived: 1, deleted: 0, skipped: 0 });
	const archived = (await f.list()).find((s) => s.id === old.id)!;
	expect(archived.archivedAt).toBe(f.ctx.now().toISOString());
	expect(archived.updatedAt).toBe(old.at.toISOString());
	expect((await f.list()).find((s) => s.id === recent.id)!.archivedAt).toBeNull();
	f.advance(4);
	expect(await f.run()).toEqual({ archived: 1, deleted: 1, skipped: 0 });
	expect((await f.list()).map((s) => s.id)).toEqual([recent.id]);
	expect(await Bun.file(join(old.directory, ".git", "HEAD")).exists()).toBe(false);
	expect((await f.db.transaction((tx) => getRun(tx, old.runId))).closedAt).not.toBeNull();
	expect(f.removedObservers).toEqual([old.runId]);
	expect(f.logs).toEqual([]);
});

test("each rule can be disabled and large valid durations do not overflow dates", async () => {
	const f = await setup();
	const old = await f.add(20);
	for (const days of [null, Number.MAX_SAFE_INTEGER]) {
		await f.policy({ archiveAfterDays: days, deleteAfterDays: days });
		expect(await f.run()).toEqual({ archived: 0, deleted: 0, skipped: 0 });
	}
	await f.policy({ archiveAfterDays: 2, deleteAfterDays: null });
	expect((await f.run()).archived).toBe(1);
	await f.policy({ archiveAfterDays: null, deleteAfterDays: 4 });
	expect((await f.run()).deleted).toBe(1);
	expect((await f.list()).some((s) => s.id === old.id)).toBe(false);
});

test("pinned, running, unknown, unconfirmed, and busy sessions survive", async () => {
	const f = await setup();
	await f.add(30, { pinned: true });
	for (const status of ["running", "unknown", null] as const) {
		const s = await f.add(30, { terminal: true });
		if (status) f.processes.set(s.terminalId!, processStatus(s.terminalId!, status, s.at));
	}
	const busy = await f.add(30);
	const release = holdSession(f.home, busy.runId);
	try {
		expect(await f.run()).toEqual({ archived: 0, deleted: 0, skipped: 4 });
	} finally {
		release();
	}
	expect(await f.list()).toHaveLength(5);
	expect(f.removedObservers).toEqual([]);
});

test("fresh runtime activity takes priority over stored inactivity", async () => {
	const f = await setup();
	const s = await f.add(30, { terminal: true });
	f.processes.set(s.terminalId!, processStatus(s.terminalId!, "exited", f.ctx.now()));
	expect(await f.run()).toEqual({ archived: 0, deleted: 0, skipped: 0 });
	expect(await f.list()).toHaveLength(1);
});

test("a retained exit capture permits cleanup after the runtime forgets the attempt", async () => {
	const f = await setup();
	const s = await f.add(7, { terminal: true });
	await writeAttemptCapture(f.home, s.runId, s.terminalId!, "Retained output");
	expect((await f.run()).deleted).toBe(1);
	expect(await Bun.file(join(f.home, "agents", s.runId, `output-${s.terminalId}.txt`)).text()).toBe("Retained output");
});

test("unsaved files and open directories preserve both the session and its observer", async () => {
	const f = await setup();
	const dirty = await f.add(10);
	const held = await f.add(10);
	await writeFile(join(dirty.directory, "notes.txt"), "Keep these notes");
	f.deps.openPaths = async () => [join(held.directory, "open.txt")];
	expect(await f.run()).toEqual({ archived: 2, deleted: 0, skipped: 2 });
	expect(await f.list()).toHaveLength(2);
	expect((await f.list()).every((session) => session.archivedAt !== null)).toBe(true);
	expect(f.removedObservers).toEqual([]);
	expect(await Bun.file(join(dirty.directory, "notes.txt")).text()).toBe("Keep these notes");
});

test("project sessions expire but ticket agents and flow runs remain", async () => {
	const f = await setup();
	const project = ulid();
	await f.db.execute(
		sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES (${project}, 'CLN', 'cleanup', 'Cleanup', ${f.ctx.now()}, ${f.ctx.now()})`,
	);
	const s = await f.add(7, { project });
	const ticket = await f.add(30, { kind: "agent" });
	const flow = await f.add(30, { kind: "flow" });
	expect((await f.run()).deleted).toBe(1);
	expect(await f.list()).toHaveLength(0);
	for (const record of [s, ticket, flow])
		expect((await f.db.transaction((tx) => getRun(tx, record.runId))).id).toBe(record.runId);
});

test("observer cancellation failure retains the session directory and record", async () => {
	const f = await setup();
	const s = await f.add(7);
	f.deps.removeObserver = async () => {
		throw new Error("The observer still runs.");
	};
	expect((await f.run()).deleted).toBe(0);
	expect(await f.list()).toHaveLength(1);
	expect(await Bun.file(join(s.directory, ".git", "HEAD")).exists()).toBe(true);
	expect(f.logs).toHaveLength(1);
});

test("a process inspection error leaves that session intact and permits other cleanup", async () => {
	const f = await setup();
	const failed = await f.add(7, { terminal: true });
	await f.add(7);
	f.deps.process = async (_ctx, id) => {
		if (id === failed.terminalId) throw new Error("Runtime unavailable");
		return null;
	};
	expect(await f.run()).toEqual({ archived: 0, deleted: 1, skipped: 1 });
	expect((await f.list()).map((s) => s.id)).toEqual([failed.id]);
});
