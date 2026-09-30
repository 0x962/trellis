import { afterEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { setPinned } from "../../agentRuns/pin.ts";
import { reserveAttempt } from "../../assignments/attempts.ts";
import { createSessionRepository } from "../directory.ts";
import { prepareUpdate } from "../prepareUpdate";
import { rename } from "../rename.ts";
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
const exec = promisify(execFile);

test("recent attempts and session edits reset inactivity", async () => {
	const f = await setup();
	const resumed = await f.add(30);
	const renamed = await f.add(30);
	await f.db.transaction((tx) => reserveAttempt({ now: f.ctx.now() }, tx, { runId: resumed.runId }));
	await prepareUpdate(rename, "session")(f.ctx, { id: renamed.id, name: "Keep this session" });
	expect((await f.run()).deleted).toBe(0);
	expect(await f.list()).toHaveLength(2);
});

test("cleanup retains runtime activity after the runtime record expires", async () => {
	const f = await setup();
	const s = await f.add(30, { terminal: true });
	f.processes.set(s.terminalId!, processStatus(s.terminalId!, "exited", f.ctx.now()));
	await f.run();
	f.processes.clear();
	expect(await f.run()).toEqual({ archived: 0, deleted: 0, skipped: 0 });
	expect(await f.list()).toHaveLength(1);
});

test("pin and rename mutations cannot overlap directory deletion", async () => {
	const f = await setup();
	const s = await f.add(7);
	f.deps.removeObserver = async () => {
		await expect(prepareUpdate(setPinned, "run")(f.ctx, { id: s.runId, pinned: true })).rejects.toThrow(
			"operation is in progress",
		);
		await expect(prepareUpdate(rename, "session")(f.ctx, { id: s.id, name: "Busy" })).rejects.toThrow(
			"operation is in progress",
		);
	};
	expect((await f.run()).deleted).toBe(1);
});

test("cleanup removes a clean project worktree and retains its branch", async () => {
	const f = await setup();
	const s = await f.add(7);
	const repository = join(f.home, "repository");
	await createSessionRepository(repository);
	const directory = join(f.home, "agents", s.runId, "work");
	await exec("git", ["-C", repository, "worktree", "add", "-b", "retained", directory]);
	await rm(s.directory, { recursive: true });
	await f.db.execute(sql`UPDATE sessions SET directory = ${directory} WHERE id = ${s.id}`);
	expect((await f.run()).deleted).toBe(1);
	expect((await exec("git", ["-C", repository, "branch", "--list", "retained"])).stdout).toContain("retained");
	expect((await exec("git", ["-C", repository, "worktree", "list", "--porcelain"])).stdout).not.toContain(directory);
});

test("ignored files and linked directories stay intact", async () => {
	const f = await setup();
	const ignored = await f.add(7);
	await writeFile(join(ignored.directory, ".git", "info", "exclude"), "ignored.txt\n");
	await writeFile(join(ignored.directory, "ignored.txt"), "Keep ignored work");
	const linked = await f.add(7);
	await rm(linked.directory, { recursive: true });
	const target = join(f.home, "kept");
	await mkdir(target);
	await writeFile(join(target, "proof.txt"), "Keep the target");
	await symlink(target, linked.directory);
	expect(await f.run()).toEqual({ archived: 1, deleted: 0, skipped: 2 });
	expect(await Bun.file(join(ignored.directory, "ignored.txt")).text()).toBe("Keep ignored work");
	expect(await Bun.file(join(target, "proof.txt")).text()).toBe("Keep the target");
	expect(f.removedObservers).toEqual([]);
});

test("an unavailable process file list prevents deletion", async () => {
	const f = await setup();
	const s = await f.add(7);
	f.deps.openPaths = async () => {
		throw new Error("Cannot read process paths");
	};
	expect((await f.run()).deleted).toBe(0);
	expect(await f.list()).toHaveLength(1);
	expect(await Bun.file(join(s.directory, ".git", "HEAD")).exists()).toBe(true);
});

test("files written while the observer stops prevent deletion", async () => {
	const f = await setup();
	const s = await f.add(7);
	f.deps.removeObserver = async () => {
		await writeFile(join(s.directory, "new.txt"), "Keep this new work");
	};
	expect(await f.run()).toEqual({ archived: 1, deleted: 0, skipped: 1 });
	expect(await f.list()).toHaveLength(1);
	expect(await Bun.file(join(s.directory, "new.txt")).text()).toBe("Keep this new work");
});
