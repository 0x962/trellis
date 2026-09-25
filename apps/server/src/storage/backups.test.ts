import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pageHomeFixture } from "../db/pageHomeFixture.ts";
import { remove } from "../services/pages/pages.ts";
import { retention } from "../services/pages/retention.ts";
import { archive, snapshot } from "../services/system.ts";
import { BACKUP_MANIFEST, sweepBackups, verifyPageObjects } from "./backups.ts";
import { blobPath } from "./blobs.ts";
import { discardPageObject, pageObjectPath, stagePageObject } from "./pageObjects.ts";

let h: Awaited<ReturnType<typeof pageHomeFixture>>;
beforeAll(async () => {
	h = await pageHomeFixture();
}, 30_000);
afterAll(async () => {
	await h.close();
});

test("snapshots live, retained, and staged objects and archives private copies after a sweep", async () => {
	await h.project("BACK");
	const page = await h.page("BACK", "Backup", "<p>Backup</p>", "backup-style");
	await h.newTx((tx) => remove(h.core, tx, { page: page.page.id, expectedVersion: 1 }));
	const pending = await h.stage("BACK", "pending");
	const active = (await stagePageObject(h.home, new File(["partial"], "partial.txt")))!;
	const attachmentSha = new Bun.CryptoHasher("sha256").update("attachment").digest("hex");
	await Bun.write(blobPath(h.home, attachmentSha), "attachment");
	const taken = await h.newTx((tx) => snapshot(h.ctx, tx, {}));
	await h.flush();
	const objects = [page.document, page.style, pending];
	await verifyPageObjects(taken.staging, objects);
	expect(await Bun.file(join(taken.staging, BACKUP_MANIFEST)).json()).toEqual({
		version: 1,
		capabilities: ["pages-v1"],
	});
	expect(existsSync(join(taken.staging, "pages", "tmp"))).toBe(false);
	h.core.now = new Date(h.at.getTime() + 31 * 24 * 60 * 60 * 1000);
	await h.newTx((tx) => retention(h.ctx, tx, {}));
	await h.flush();
	expect(existsSync(pageObjectPath(h.home, page.document.sha256))).toBe(false);
	const result = await archive(taken);
	expect(result.bytes).toBeGreaterThan(0);
	expect(existsSync(taken.staging)).toBe(false);
	expect(existsSync(`${taken.path}.partial`)).toBe(false);
	const extracted = join(h.home, "extracted");
	await mkdir(extracted);
	const proc = Bun.spawn(["tar", "-xzf", result.path, "-C", extracted]);
	expect(await proc.exited).toBe(0);
	await verifyPageObjects(extracted, objects);
	expect(await Bun.file(blobPath(extracted, attachmentSha)).text()).toBe("attachment");
	await discardPageObject(h.home, active);
	h.core.now = h.at;
});

test("overlapping backups with the same timestamp keep separate snapshots", async () => {
	const first = await h.newTx((tx) => snapshot(h.ctx, tx, {}));
	const second = await h.newTx((tx) => snapshot(h.ctx, tx, {}));
	expect(first.staging).not.toBe(second.staging);
	expect(first.path).not.toBe(second.path);
	await archive(first);
	expect(existsSync(second.staging)).toBe(true);
	await archive(second);
	expect(existsSync(first.path)).toBe(true);
	expect(existsSync(second.path)).toBe(true);
});

test("a missing referenced object aborts snapshot and removes its partial directory", async () => {
	const pending = await h.stage("BACK", "missing");
	await rm(pageObjectPath(h.home, pending.sha256));
	h.core.now = new Date(h.at.getTime() + 1000);
	await expect(h.newTx((tx) => snapshot(h.ctx, tx, {}))).rejects.toThrow();
	expect((await readdir(join(h.home, "backups"))).filter((name) => name.startsWith("snapshot-"))).toEqual([]);
});

test("boot cleanup removes incomplete backups and preserves complete archives", async () => {
	const dir = join(h.home, "sweep-fixture");
	await mkdir(join(dir, "snapshot-interrupted"), { recursive: true });
	await Bun.write(join(dir, "trellis-interrupted.tar.gz.partial"), "partial");
	await Bun.write(join(dir, "trellis-complete.tar.gz"), "complete");
	expect(sweepBackups(dir).sort()).toEqual(["snapshot-interrupted", "trellis-interrupted.tar.gz.partial"]);
	expect(await readdir(dir)).toEqual(["trellis-complete.tar.gz"]);
});
