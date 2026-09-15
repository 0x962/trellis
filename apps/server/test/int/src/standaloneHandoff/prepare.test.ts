import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDatabase } from "../../../../src/db/open.ts";
import { scan } from "../../../../src/homeImport/scan.ts";
import { lockHome } from "../../../../src/homeLock.ts";
import { assertStandaloneHandoffReady } from "../../../../src/standaloneHandoff/bootGuard.ts";
import { prepareStandaloneHandoff } from "../../../../src/standaloneHandoff/prepare.ts";
import { seedRoot } from "../../../fixtures/projects.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

test("handoff backs up original settings and preserves unresolved external runs while it pauses automation", async () => {
	const home = await mkdtemp("/tmp/trl-handoff-");
	try {
		lockHome(home, "server", 4521).release();
		const lock = await readFile(join(home, "trellis.lock"), "utf8");
		const initial = await openDatabase(join(home, "db"));
		const project = await seedRoot(initial.db, "KEEP", {
			manager_config: { ade: "superset", directory: "/tmp/retained", trustedDirectory: true, dispatchPaused: false },
		});
		await initial.db.execute(
			sql`INSERT INTO settings (key,value,updated_at) VALUES ('agents','{"enabled":true,"runner":"superset","projects":[]}'::jsonb,now())`,
		);
		await initial.db.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,closed_at,runtime,workspace_id,session_id,created_at,updated_at) VALUES ('external','Keep','Keep','manager','',${project},'KEEP',NULL,'superset','original-workspace','original-conversation',now(),now())`,
		);
		await initial.db.transaction(assertStatusInvariant);
		await initial.close();
		await mkdir(join(home, "attachments"));
		await writeFile(join(home, "attachments", "keep"), "retained bytes");
		const backupPath = join(home, "backups", "desktop-handoff-fixture");
		const before = await scan(join(home, "db"), join(backupPath, "db"));
		const result = await prepareStandaloneHandoff({ home, backupPath, restoreStandaloneService: true });
		expect((await scan(join(backupPath, "db"), join(home, "unused"))).version).toBe(before.version);
		expect(result.automationPaused).toBe(true);
		expect(result.restoreCommands[0]!.args).toContain(`gui/${process.getuid!()}/com.trellis.server`);
		expect(await readFile(join(home, "trellis.lock"), "utf8")).toBe(lock);
		expect(await readFile(join(home, "attachments", "keep"), "utf8")).toBe("retained bytes");
		expect(() => assertStandaloneHandoffReady(home)).not.toThrow();
		const live = await openDatabase(join(home, "db"));
		const saved = await openDatabase(join(backupPath, "db"));
		try {
			expect((await live.db.execute(sql`SELECT value FROM settings WHERE key='nativeWorkPaused'`)).rows[0]!.value).toBe(
				true,
			);
			expect((await live.db.execute(sql`SELECT value FROM settings WHERE key='agents'`)).rows[0]!.value).toMatchObject({
				enabled: false,
			});
			expect((await saved.db.execute(sql`SELECT value FROM settings WHERE key='agents'`)).rows[0]!.value).toMatchObject(
				{ enabled: true },
			);
			expect((await live.db.execute(sql`SELECT manager_config FROM projects`)).rows[0]!.manager_config).toMatchObject({
				ade: "superset",
				directory: "/tmp/retained",
				dispatchPaused: true,
				trustedDirectory: false,
			});
			expect((await live.db.execute(sql`SELECT closed_at,workspace_id,session_id FROM agent_runs`)).rows[0]).toEqual({
				closed_at: null,
				workspace_id: "original-workspace",
				session_id: "original-conversation",
			});
			await live.db.transaction(assertStatusInvariant);
			await saved.db.transaction(assertStatusInvariant);
		} finally {
			await live.close();
			await saved.close();
		}
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("handoff refuses a live host before it creates a backup", async () => {
	const home = await mkdtemp("/tmp/trl-handoff-live-");
	const owner = lockHome(home, "server", 4521);
	try {
		await mkdir(join(home, "db"));
		await writeFile(join(home, "db", "PG_VERSION"), "17");
		await expect(
			prepareStandaloneHandoff({ home, backupPath: join(home, "backups", "desktop-handoff-blocked") }),
		).rejects.toThrow("live owner");
		expect(await Bun.file(join(home, "standalone-handoff-in-progress.json")).exists()).toBe(false);
	} finally {
		owner.release();
		await rm(home, { recursive: true, force: true });
	}
});

test("interrupted handoff blocks boot and retains its backup", async () => {
	const home = await mkdtemp("/tmp/trl-handoff-marker-");
	try {
		await writeFile(join(home, "standalone-handoff-in-progress.json"), "{");
		expect(() => assertStandaloneHandoffReady(home)).toThrow("incomplete");
		expect(await readFile(join(home, "standalone-handoff-in-progress.json"), "utf8")).toBe("{");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("the host refuses an interrupted handoff before it creates a database", async () => {
	const home = await mkdtemp("/tmp/trl-handoff-boot-");
	try {
		await writeFile(join(home, "standalone-handoff-in-progress.json"), "{");
		const child = Bun.spawn([process.execPath, join(originDir(import.meta.dir), "../index.ts")], {
			env: { ...process.env, TRELLIS_HOME: home, TRELLIS_PORT: "0", TRELLIS_LOG_FORMAT: "json" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect(code).toBe(1);
		expect(stdout + stderr).toContain("Standalone handoff is incomplete");
		expect(await Bun.file(join(home, "db", "PG_VERSION")).exists()).toBe(false);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("an unresolved runtime record refuses handoff before backup or pause", async () => {
	const home = await mkdtemp("/tmp/trl-handoff-runtime-");
	try {
		lockHome(home, "server", 4521).release();
		await mkdir(join(home, "db"));
		await writeFile(join(home, "db", "PG_VERSION"), "17");
		await mkdir(join(home, "runtime", "sessions"), { recursive: true });
		await writeFile(
			join(home, "runtime", "sessions", "unknown.session.json"),
			JSON.stringify({ session: { id: "unknown", pid: null, status: "unknown" } }),
		);
		await expect(
			prepareStandaloneHandoff({ home, backupPath: join(home, "backups", "desktop-handoff-blocked") }),
		).rejects.toThrow("unknown");
		expect(await Bun.file(join(home, "standalone-handoff-in-progress.json")).exists()).toBe(false);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
