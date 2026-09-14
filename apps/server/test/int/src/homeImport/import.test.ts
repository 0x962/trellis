import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDatabase } from "../../../../src/db/open.ts";
import { assertHomeImportReady } from "../../../../src/homeImport/bootGuard.ts";
import { importHome } from "../../../../src/homeImport/importHome.ts";
import { preview } from "../../../../src/homeImport/preview.ts";
import { rollback } from "../../../../src/homeImport/rollback.ts";
import { lockHome } from "../../../../src/homeLock.ts";
import { seedActors, seedRoot, seedStatus } from "../../../fixtures/projects.ts";
import { seedActivity, seedComment, seedTicket } from "../../../fixtures/tickets.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let root: string;
let source: string;
let projectId: string;
beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "trellis-home-import-"));
	source = join(root, "source");
	await mkdir(source);
	lockHome(source, "restore", null).release();
	const database = await openDatabase(join(source, "db"));
	projectId = await seedRoot(database.db, "COPY", {
		manager_config: {
			personaId: null,
			concurrency: 2,
			directory: "/tmp/original-repo",
			trustedDirectory: true,
			dispatchPaused: false,
			ade: "superset",
		},
	});
	await database.db.execute(
		sql`INSERT INTO settings (key,value,updated_at) VALUES ('agents','{"runner":"superset","enabled":true,"projects":[]}'::jsonb,now())`,
	);
	const statusId = await seedStatus(database.db, {
		projectId,
		name: "Todo",
		category: "todo",
		position: 0,
		isDefault: true,
	});
	const ticketId = await seedTicket(database.db, { projectId, rootId: projectId, statusId });
	await seedActors(database.db);
	await seedComment(database.db, ticketId, "Retained conversation");
	await seedActivity(database.db, { projectId, rootId: projectId, ticketId });
	await database.db.execute(
		sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,workspace_id,session_id,created_at,updated_at) VALUES ('retained-worker','Fixture','Fixture','builder','',${projectId},'COPY','stopped','native',${join(source, "agents", "retained-worker", "work")},'retained-conversation',now(),now())`,
	);
	await database.db.execute(
		sql`INSERT INTO evidence_artifacts (id,run_id,attempt_id,path,document,created_at) VALUES ('retained-artifact','retained-worker','retained-attempt','result.ts','{"sha256":"retained"}'::jsonb,now())`,
	);
	await database.db.transaction(assertStatusInvariant);
	await database.close();
	await mkdir(join(source, "agents", "retained-worker", "work"), { recursive: true });
	await writeFile(join(source, "agents", "retained-worker", "work", "result.ts"), "export const result=42;");
	await writeFile(join(source, "agents", "retained-worker", "output.txt"), "Retained terminal output");
	await mkdir(join(source, "attachments"));
	await writeFile(join(source, "attachments", "fixture"), "attachment bytes");
	await writeFile(join(source, "desktop-token"), "SECRET_DO_NOT_COPY");
	await writeFile(join(source, "desktop-active-release.json"), JSON.stringify({ id: "source-release" }));
});
afterAll(() => rm(root, { recursive: true, force: true }));
test("offline import preserves source bytes and pauses automation before the target can boot", async () => {
	const target = join(root, "target");
	const owner = await readFile(join(source, "trellis.lock"), "utf8");
	const before = await preview({ source, target });
	const result = await importHome({ source, target, expectedVersion: before.version });
	expect(result.state).toBe("prepared");
	expect(await readFile(join(source, "trellis.lock"), "utf8")).toBe(owner);
	expect((await preview({ source, target: join(root, "next") })).version).toBe(before.version);
	expect(await readFile(join(target, "attachments", "fixture"), "utf8")).toBe("attachment bytes");
	expect(await Bun.file(join(target, "desktop-token")).exists()).toBe(false);
	expect(await Bun.file(join(target, "desktop-active-release.json")).exists()).toBe(false);
	expect(await readFile(join(source, "desktop-active-release.json"), "utf8")).toBe(
		JSON.stringify({ id: "source-release" }),
	);
	expect(JSON.stringify(result)).not.toContain("SECRET_DO_NOT_COPY");
	expect(() => assertHomeImportReady(target)).not.toThrow();
	const database = await openDatabase(join(target, "db"));
	const project = (await database.db.execute(sql`SELECT manager_config FROM projects WHERE id=${projectId}`)).rows[0]!;
	expect(project.manager_config).toMatchObject({ dispatchPaused: true, trustedDirectory: false });
	expect(result.counts).toMatchObject({ tickets: 1, agents: 1, artifacts: 1 });
	expect(result.workspaceReferences[0]).toMatchObject({
		id: "retained-worker",
		conversationId: "retained-conversation",
		workspaceId: join(source, "agents", "retained-worker", "work"),
	});
	expect((await database.db.execute(sql`SELECT body FROM comments`)).rows[0]!.body).toBe("Retained conversation");
	expect((await database.db.execute(sql`SELECT count(*)::int AS count FROM activity`)).rows[0]!.count).toBe(1);
	expect(await readFile(join(target, "agents", "retained-worker", "output.txt"), "utf8")).toBe(
		"Retained terminal output",
	);
	const settings = (await database.db.execute(sql`SELECT key,value FROM settings ORDER BY key`)).rows;
	expect(settings).toEqual(
		expect.arrayContaining([
			{ key: "agents", value: { runner: "superset", enabled: false, projects: [] } },
			{ key: "nativeWorkPaused", value: true },
		]),
	);
	await database.db.transaction(assertStatusInvariant);
	await database.close();
	await writeFile(join(target, "new-output.txt"), "keep new work");
	const archive = join(root, "archived-target");
	await rollback({ target, archive });
	expect(await readFile(join(archive, "new-output.txt"), "utf8")).toBe("keep new work");
	expect(await readFile(join(source, "attachments", "fixture"), "utf8")).toBe("attachment bytes");
});
test("live source and nonempty target reject before copy", async () => {
	const owner = lockHome(source, "server", 4777);
	await expect(preview({ source, target: join(root, "live-target") })).rejects.toThrow("lock");
	owner.release();
	const target = join(root, "occupied");
	await mkdir(target);
	await writeFile(join(target, "keep.txt"), "keep");
	await expect(preview({ source, target })).rejects.toThrow("empty");
	expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("keep");
});

test("a killed import leaves an unbootable target that explicit rollback archives", async () => {
	const target = join(root, "interrupted");
	const before = await preview({ source, target });
	const entry = join(originDir(import.meta.dir), "entry.ts");
	const child = Bun.spawn(
		[process.execPath, entry, "import", "--source", source, "--target", target, "--expected-version", before.version],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const deadline = Date.now() + 10000;
	while (!(await Bun.file(join(target, "import-in-progress.json")).exists()) && Date.now() < deadline)
		await Bun.sleep(5);
	child.kill("SIGKILL");
	await child.exited;
	expect(await Bun.file(join(target, "import-in-progress.json")).exists()).toBe(true);
	expect(await Bun.file(join(target, "import-provenance.json")).exists()).toBe(false);
	expect(() => assertHomeImportReady(target)).toThrow("rollback");
	const archive = join(root, "interrupted-archive");
	await rollback({ target, archive });
	expect(await Bun.file(join(archive, "import-in-progress.json")).exists()).toBe(true);
	expect((await preview({ source, target: join(root, "after-crash") })).version).toBe(before.version);
});

test("stale source previews, nested homes, and runtime ownership refuse import", async () => {
	const target = join(root, "stale");
	const before = await preview({ source, target });
	await writeFile(join(source, "change.txt"), "changed after preview");
	await expect(importHome({ source, target, expectedVersion: before.version })).rejects.toThrow("source changed");
	await rm(join(source, "change.txt"));
	await expect(preview({ source, target: join(source, "nested") })).rejects.toThrow("separate");
	await mkdir(join(source, "runtime", "sessions"), { recursive: true });
	await writeFile(
		join(source, "runtime", "sessions", "active.session.json"),
		JSON.stringify({ session: { id: "active", pid: process.pid, status: "running" } }),
	);
	await expect(preview({ source, target })).rejects.toThrow("active");
	await rm(join(source, "runtime"), { recursive: true });
});

test("rollback refuses an active target host and a new unresolved run", async () => {
	const target = join(root, "rollback-live");
	const before = await preview({ source, target });
	await importHome({ source, target, expectedVersion: before.version });
	const owner = lockHome(target, "server", 4777);
	await expect(rollback({ target, archive: join(root, "refused-archive") })).rejects.toThrow("lock");
	owner.release();
	const database = await openDatabase(join(target, "db"));
	await database.db.execute(
		sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,created_at,updated_at) VALUES ('unresolved','Fixture','Fixture','builder','',${projectId},'COPY','interrupted','native',now(),now())`,
	);
	await database.db.transaction(assertStatusInvariant);
	await database.close();
	await expect(rollback({ target, archive: join(root, "refused-archive") })).rejects.toThrow("unresolved");
});

test("workspace symlinks stay links and an alias into the target refuses import", async () => {
	const target = join(root, "symlink-target");
	const work = join(source, "agents", "retained-worker", "work");
	await writeFile(join(root, "outside.txt"), "outside content");
	await symlink(join(root, "outside.txt"), join(work, "outside-link"));
	const before = await preview({ source, target });
	await importHome({ source, target, expectedVersion: before.version });
	expect(await readlink(join(target, "agents", "retained-worker", "work", "outside-link"))).toBe(
		join(root, "outside.txt"),
	);
	await rm(join(work, "outside-link"));
	await symlink(join(root, "future-target"), join(work, "overlap"));
	await expect(preview({ source, target: join(root, "future-target") })).rejects.toThrow("target home");
	await rm(join(work, "overlap"));
	await symlink(source, join(root, "source-alias"));
	await expect(preview({ source, target: join(root, "source-alias", "nested") })).rejects.toThrow("separate");
});

test("the server rejects an interrupted import before it opens a database", async () => {
	const target = join(root, "boot-refused");
	await mkdir(target);
	await writeFile(join(target, "import-in-progress.json"), "{}");
	const entry = join(originDir(import.meta.dir), "../index.ts");
	const child = Bun.spawn([process.execPath, entry], {
		env: { ...process.env, TRELLIS_HOME: target, TRELLIS_PORT: "0", TRELLIS_DB_INLINE: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(code).toBe(1);
	expect(stdout + stderr + (await readFile(join(target, "server.log"), "utf8"))).toContain("home-import rollback");
	expect(await Bun.file(join(target, "db", "PG_VERSION")).exists()).toBe(false);
});

test("rollback archives a truncated initial marker without source metadata", async () => {
	const target = join(root, "truncated");
	await mkdir(target);
	lockHome(target, "restore", null).release();
	await writeFile(join(target, "import-in-progress.json"), '{"source":');
	const result = await rollback({ target, archive: join(root, "truncated-archive") });
	expect(result.source).toBeNull();
	expect(await readFile(join(root, "truncated-archive", "import-in-progress.json"), "utf8")).toBe('{"source":');
});

test("external relative workspace links keep their referent when the target depth changes", async () => {
	const target = join(root, "deeper", "target");
	await mkdir(join(root, "deeper"));
	const work = join(source, "agents", "retained-worker", "work");
	await writeFile(join(root, "outside-relative.txt"), "retained bytes");
	await symlink("../../../../outside-relative.txt", join(work, "relative-link"));
	const before = await preview({ source, target });
	await importHome({ source, target, expectedVersion: before.version });
	expect(await readFile(join(target, "agents", "retained-worker", "work", "relative-link"), "utf8")).toBe(
		"retained bytes",
	);
	expect(await readlink(join(work, "relative-link"))).toBe("../../../../outside-relative.txt");
	await rm(join(work, "relative-link"));
});

test("a file added during copy prevents publication", async () => {
	const target = join(root, "concurrent-change");
	const before = await preview({ source, target });
	const entry = join(originDir(import.meta.dir), "entry.ts");
	const child = Bun.spawn(
		[process.execPath, entry, "import", "--source", source, "--target", target, "--expected-version", before.version],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const stderrOutput = new Response(child.stderr).text();
	const deadline = Date.now() + 10000;
	while (!(await Bun.file(join(target, "import-in-progress.json")).exists()) && Date.now() < deadline)
		await Bun.sleep(5);
	await writeFile(join(source, "concurrent-file.txt"), "new work during copy");
	const [code, stderr] = await Promise.all([child.exited, stderrOutput]);
	expect({ code, signal: child.signalCode, stderr }).toMatchObject({
		code: 1,
		stderr: expect.stringContaining("Source changed during import"),
	});
	expect(await Bun.file(join(target, "import-in-progress.json")).exists()).toBe(true);
	await rm(join(source, "concurrent-file.txt"));
});
