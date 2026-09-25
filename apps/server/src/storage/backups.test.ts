import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pageHomeFixture } from "../db/pageHomeFixture.ts";
import { remove } from "../services/pages/pages.ts";
import { purgeExpiredPages } from "../services/pages/retention";
import { archive, snapshot } from "../services/system.ts";
import { BACKUP_MANIFEST, sweepBackups, verifyPageObjects } from "./backups.ts";
import { blobPath } from "./blobs.ts";
import { discardPageObject, pageObjectPath, stagePageObject } from "./pageObjects.ts";

let fixture: Awaited<ReturnType<typeof pageHomeFixture>>;
beforeAll(async () => {
	fixture = await pageHomeFixture();
}, 30_000);
afterAll(async () => {
	await fixture.close();
});

test("snapshots live, retained, and staged objects and archives private copies after a sweep", async () => {
	await fixture.project("BACK");
	const page = await fixture.page("BACK", "Backup", "<p>Backup</p>", "backup-style");
	await fixture.newTx((tx) => remove(fixture.core, tx, { page: page.page.id, expectedVersion: 1 }));
	const pending = await fixture.stage("BACK", "pending");
	const active = (await stagePageObject(fixture.home, new File(["partial"], "partial.txt")))!;
	const attachmentSha = new Bun.CryptoHasher("sha256").update("attachment").digest("hex");
	await Bun.write(blobPath(fixture.home, attachmentSha), "attachment");
	const taken = await fixture.newTx((tx) => snapshot(fixture.ctx, tx, {}));
	await fixture.flush();
	const objects = [page.document, page.style, pending];
	await verifyPageObjects(taken.staging, objects);
	expect(await Bun.file(join(taken.staging, BACKUP_MANIFEST)).json()).toEqual({
		version: 1,
		capabilities: ["pages-v1"],
	});
	expect(existsSync(join(taken.staging, "pages", "tmp"))).toBe(false);
	fixture.core.now = new Date(fixture.at.getTime() + 31 * 24 * 60 * 60 * 1000);
	await fixture.newTx((tx) => purgeExpiredPages(fixture.ctx, tx, {}));
	await fixture.flush();
	expect(existsSync(pageObjectPath(fixture.home, page.document.sha256))).toBe(false);
	const result = await archive(taken);
	expect(result.bytes).toBeGreaterThan(0);
	expect(existsSync(taken.staging)).toBe(false);
	expect(existsSync(`${taken.path}.partial`)).toBe(false);
	const extracted = join(fixture.home, "extracted");
	await mkdir(extracted);
	const proc = Bun.spawn(["tar", "-xzf", result.path, "-C", extracted]);
	expect(await proc.exited).toBe(0);
	await verifyPageObjects(extracted, objects);
	expect(await Bun.file(blobPath(extracted, attachmentSha)).text()).toBe("attachment");
	await discardPageObject(fixture.home, active);
	fixture.core.now = fixture.at;
});

test("overlapping backups with the same timestamp keep separate snapshots", async () => {
	const first = await fixture.newTx((tx) => snapshot(fixture.ctx, tx, {}));
	const second = await fixture.newTx((tx) => snapshot(fixture.ctx, tx, {}));
	expect(first.staging).not.toBe(second.staging);
	expect(first.path).not.toBe(second.path);
	await archive(first);
	expect(existsSync(second.staging)).toBe(true);
	await archive(second);
	expect(existsSync(first.path)).toBe(true);
	expect(existsSync(second.path)).toBe(true);
});

test("a missing referenced object aborts snapshot and removes its partial directory", async () => {
	const pending = await fixture.stage("BACK", "missing");
	await rm(pageObjectPath(fixture.home, pending.sha256));
	fixture.core.now = new Date(fixture.at.getTime() + 1000);
	await expect(fixture.newTx((tx) => snapshot(fixture.ctx, tx, {}))).rejects.toThrow();
	expect((await readdir(join(fixture.home, "backups"))).filter((name) => name.startsWith("snapshot-"))).toEqual([]);
});

test("boot cleanup removes incomplete backups and preserves complete archives", async () => {
	const dir = join(fixture.home, "sweep-fixture");
	await mkdir(join(dir, "snapshot-interrupted"), { recursive: true });
	await Bun.write(join(dir, "trellis-interrupted.tar.gz.partial"), "partial");
	await Bun.write(join(dir, "trellis-complete.tar.gz"), "complete");
	expect(sweepBackups(dir).sort()).toEqual(["snapshot-interrupted", "trellis-interrupted.tar.gz.partial"]);
	expect(await readdir(dir)).toEqual(["trellis-complete.tar.gz"]);
});
