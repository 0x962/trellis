import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase } from "./db/open.ts";
import { pageHomeFixture } from "./db/pageHomeFixture.ts";
import { lockHome } from "./homeLock.ts";
import { restoreHome } from "./restore.ts";
import { pageObjects } from "./services/pages/objects.ts";
import { remove } from "./services/pages/pages.ts";
import { archive, snapshot } from "./services/system.ts";
import { BACKUP_MANIFEST, verifyPageObjects } from "./storage/backups.ts";
import { blobPath } from "./storage/blobs.ts";
import { pageObjectPath } from "./storage/pageObjects.ts";

let h: Awaited<ReturnType<typeof pageHomeFixture>>;
let root: string;
let backup: string;
let documentSha: string;
let attachmentSha: string;

beforeAll(async () => {
	h = await pageHomeFixture();
	root = await mkdtemp(join(tmpdir(), "trellis-restore-proof-"));
	await h.project("REST");
	const page = await h.page("REST", "Restore", "<p>Restore</p>", "restore-css");
	documentSha = page.document.sha256;
	await h.newTx((tx) => remove(h.core, tx, { page: page.page.id, expectedVersion: 1 }));
	await h.stage("REST", "staged restore");
	attachmentSha = new Bun.CryptoHasher("sha256").update("attachment").digest("hex");
	await Bun.write(blobPath(h.home, attachmentSha), "attachment");
	backup = (await archive(await h.newTx((tx) => snapshot(h.ctx, tx, {})))).path;
	await h.flush();
}, 30_000);
afterAll(async () => {
	await h.close();
	await rm(root, { recursive: true, force: true });
});

const changedArchive = async (name: string, change: (path: string) => Promise<void>) => {
	const path = join(root, name);
	await mkdir(path);
	const extract = Bun.spawn(["tar", "-xzf", backup, "-C", path]);
	expect(await extract.exited).toBe(0);
	await change(path);
	const archive = `${path}.tar.gz`;
	const pack = Bun.spawn(["tar", "-czf", archive, "-C", path, "."]);
	expect(await pack.exited).toBe(0);
	return archive;
};

test("restores and verifies real Page objects, retained rows, staged rows, and attachments", async () => {
	const home = join(root, "success");
	await mkdir(home);
	await Bun.write(join(home, "settings.txt"), "preserve");
	await restoreHome(home, backup);
	const restored = await openDatabase(join(home, "db"));
	try {
		const objects = await restored.db.transaction(pageObjects);
		expect(objects).toHaveLength(3);
		await verifyPageObjects(home, objects);
		expect((await restored.db.execute(sql`SELECT deleted_at FROM pages`)).rows[0]!.deleted_at).not.toBeNull();
		expect(await Bun.file(blobPath(home, attachmentSha)).text()).toBe("attachment");
		expect(await Bun.file(join(home, "settings.txt")).text()).toBe("preserve");
	} finally {
		await restored.close();
	}
	expect((await readdir(root)).filter((name) => name.startsWith("success."))).toEqual([]);
}, 30_000);

for (const failure of ["corrupt", "missing", "size", "capability", "database", "symlink"]) {
	test(`refuses ${failure} before it changes the active home and releases the locks`, async () => {
		const bad = await changedArchive(failure, async (path) => {
			if (failure === "symlink") {
				await rm(join(path, "db"), { recursive: true });
				await symlink(join(h.home, "db"), join(path, "db"));
			}
			if (failure === "database") await rm(join(path, "db"), { recursive: true });
			if (failure === "corrupt") await Bun.write(pageObjectPath(path, documentSha), "broken");
			if (failure === "missing") await rm(pageObjectPath(path, documentSha));
			if (failure === "capability")
				await Bun.write(join(path, BACKUP_MANIFEST), JSON.stringify({ version: 1, capabilities: ["pages-v2"] }));
			if (failure === "size") {
				const database = await openDatabase(join(path, "db"));
				await database.db.execute(sql`UPDATE page_versions SET document_size = document_size + 1`);
				await database.close();
			}
		});
		const home = join(root, `active-${failure}`);
		await mkdir(home);
		await Bun.write(join(home, "sentinel"), "unchanged");
		await expect(restoreHome(home, bad)).rejects.toThrow();
		expect(await Bun.file(join(home, "sentinel")).text()).toBe("unchanged");
		expect(existsSync(join(home, "db"))).toBe(false);
		expect((await readdir(root)).filter((name) => name.startsWith(`active-${failure}.`))).toEqual([]);
		lockHome(home, "restore", null).release();
	}, 30_000);
}

test("accepts a legacy archive without a capability manifest and still verifies Page rows", async () => {
	const legacy = await changedArchive("legacy", (path) => rm(join(path, BACKUP_MANIFEST)));
	await restoreHome(join(root, "legacy-home"), legacy);
	expect(await Bun.file(pageObjectPath(join(root, "legacy-home"), documentSha)).text()).toBe("<p>Restore</p>");
}, 30_000);

test("refuses a locked home before archive extraction", async () => {
	const home = join(root, "locked");
	const lock = lockHome(home, "server", 4521);
	try {
		await expect(restoreHome(home, backup)).rejects.toThrow("Stop that process first");
	} finally {
		lock.release();
	}
	expect(existsSync(join(home, "db"))).toBe(false);
});
