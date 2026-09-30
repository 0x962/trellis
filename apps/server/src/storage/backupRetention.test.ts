import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import * as files from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { backupFixture } from "../db/backupFixture";
import { openDatabase } from "../db/open.ts";
import { restoreHome } from "../restore.ts";
import { remove as removeAttachment } from "../services/attachments.ts";
import { gcBlobs } from "../services/blobs.ts";
import { collectUnheldPageObjects, remove as removePage } from "../services/pages/pages.ts";
import { purgeExpiredPages } from "../services/pages/retention";
import { archive, prepareSnapshot } from "../services/system.ts";
import { verifyPageObjects } from "./backups.ts";
import { blobPath, gcBlobs as collectBlobs, storeFile } from "./blobs.ts";
import { pageObjectPath } from "./pageObjects.ts";

let fixture: Awaited<ReturnType<typeof backupFixture>>;
beforeEach(async () => {
	fixture = await backupFixture();
}, 30_000);
afterEach(async () => {
	await fixture.close();
});

const withinDeadline = async <T>(value: Promise<T>) => {
	let timer: ReturnType<typeof setTimeout>;
	try {
		return await Promise.race([
			value,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("The database remains blocked during object copies.")), 2000);
			}),
		]);
	} finally {
		clearTimeout(timer!);
	}
};

test("retains deleted files while uploads and ticket reads finish, then restores the captured rows", async () => {
	const attachment = await fixture.attach("original attachment");
	const page = await fixture.page("BACK", "Captured", "<p>captured</p>", "captured css");
	await fixture.newTx((tx) => removePage(fixture.core, tx, { page: page.page.id, expectedVersion: 1 }));
	const copying = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	const copy = files.copyFile;
	const paused = spyOn(files, "copyFile").mockImplementation(async (...args) => {
		copying.resolve();
		await resume.promise;
		await copy(...args);
	});
	const pending = prepareSnapshot(fixture.ctx, {});
	let collections: Promise<void> = Promise.resolve();
	try {
		await withinDeadline(copying.promise);
		await withinDeadline(fixture.newTx((tx) => removeAttachment(fixture.ctx, tx, { id: attachment.id })));
		fixture.core.now = new Date(fixture.at.getTime() + 31 * 24 * 60 * 60 * 1000);
		await withinDeadline(fixture.newTx((tx) => purgeExpiredPages(fixture.ctx, tx, {})));
		let collected = false;
		collections = Promise.all(fixture.tasks.splice(0).map((task) => task())).then(() => {
			collected = true;
		});
		await withinDeadline(fixture.attach("new attachment"));
		await withinDeadline(fixture.stage("BACK", "new Page upload"));
		await fixture.newTx((tx) =>
			tx.execute(sql`UPDATE tickets SET title = 'After backup' WHERE id = ${fixture.ticketId}`),
		);
		const read = await withinDeadline(
			fixture.newTx((tx) => tx.execute(sql`SELECT title FROM tickets WHERE id = ${fixture.ticketId}`)),
		);
		expect(read.rows).toEqual([{ title: "After backup" }]);
		expect(collected).toBe(false);
		expect(existsSync(blobPath(fixture.home, attachment.sha256))).toBe(true);
		expect(existsSync(pageObjectPath(fixture.home, page.document.sha256))).toBe(true);
		resume.resolve();
		const taken = await pending;
		await collections;
		expect(existsSync(blobPath(fixture.home, attachment.sha256))).toBe(false);
		expect(existsSync(pageObjectPath(fixture.home, page.document.sha256))).toBe(false);
		await verifyPageObjects(taken.staging, [page.document, page.style]);
		const output = await archive(taken);
		const restoredHome = join(fixture.home, "restored");
		await restoreHome(restoredHome, output.path);
		const restored = await openDatabase(join(restoredHome, "db"));
		try {
			expect((await restored.db.execute(sql`SELECT title FROM tickets`)).rows).toEqual([{ title: "Before backup" }]);
			expect((await restored.db.execute(sql`SELECT id FROM attachments`)).rows).toEqual([{ id: attachment.id }]);
			expect((await restored.db.execute(sql`SELECT id FROM pages`)).rows).toEqual([{ id: page.page.id }]);
			expect((await restored.db.execute(sql`SELECT id FROM page_uploads`)).rows).toEqual([]);
			await verifyPageObjects(restoredHome, [page.document, page.style]);
			expect(await Bun.file(blobPath(restoredHome, attachment.sha256)).text()).toBe("original attachment");
		} finally {
			await restored.close();
		}
	} finally {
		resume.resolve();
		await Promise.allSettled([pending, collections]);
		paused.mockRestore();
	}
}, 30_000);

test("releases collection and removes only its own staging directory after a partial copy fails", async () => {
	const attachment = await fixture.attach("copy failure attachment");
	const page = await fixture.stage("BACK", "copy failure Page");
	const neighbor = join(fixture.home, "backups", "snapshot-other-operation", "sentinel");
	await Bun.write(neighbor, "preserve");
	const copy = files.copyFile;
	let copied = 0;
	const failure = new Error("copy failed");
	const failing = spyOn(files, "copyFile").mockImplementation(async (...args) => {
		if (copied++ === 1) throw failure;
		await copy(...args);
	});
	try {
		await expect(prepareSnapshot(fixture.ctx, {})).rejects.toBe(failure);
	} finally {
		failing.mockRestore();
	}
	expect(copied).toBe(2);
	expect(await files.readdir(join(fixture.home, "backups"))).toEqual(["snapshot-other-operation"]);
	expect(await Bun.file(neighbor).text()).toBe("preserve");
	expect(await Bun.file(blobPath(fixture.home, attachment.sha256)).text()).toBe("copy failure attachment");
	await verifyPageObjects(fixture.home, [page]);
	await fixture.newTx(async (tx) => {
		await tx.execute(sql`DELETE FROM attachments WHERE id = ${attachment.id}`);
		await tx.execute(sql`DELETE FROM page_uploads WHERE id = ${page.id}`);
	});
	expect(await withinDeadline(gcBlobs(fixture.ctx, [attachment.sha256]))).toEqual({ removed: [attachment.sha256] });
	expect(await withinDeadline(collectUnheldPageObjects(fixture.ctx, [page.sha256]))).toEqual({
		removed: [page.sha256],
	});
});

test("waits for an earlier collector before it acquires the database transaction", async () => {
	const orphan = await storeFile(fixture.home, new File(["orphan"], "orphan"));
	const checking = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<boolean>();
	const collection = collectBlobs(fixture.home, [orphan.sha256], async () => {
		checking.resolve();
		return resume.promise;
	});
	await checking.promise;
	let captures = 0;
	const pending = prepareSnapshot(
		{
			...fixture.ctx,
			newTx: (fn) => {
				captures++;
				return fixture.newTx(fn);
			},
		},
		{},
	);
	try {
		await withinDeadline(fixture.newTx((tx) => tx.execute(sql`SELECT id FROM tickets`)));
		expect(captures).toBe(0);
		resume.resolve(false);
		await collection;
		const taken = await pending;
		expect(captures).toBe(1);
		expect(existsSync(blobPath(taken.staging, orphan.sha256))).toBe(false);
		await archive(taken);
	} finally {
		resume.resolve(false);
		await Promise.allSettled([pending, collection]);
	}
});

test("captures files held only by PR evidence or an epic resource", async () => {
	const prFile = await storeFile(fixture.home, new File(["PR evidence"], "evidence.txt"));
	const resource = await storeFile(fixture.home, new File(["epic resource"], "resource.txt"));
	const prId = ulid();
	const epicId = ulid();
	await fixture.newTx(async (tx) => {
		await tx.execute(sql`INSERT INTO pull_requests (id,owner,repo,number,url,state,head_sha,created_at,updated_at)
			VALUES (${prId},'example','backup',1,'https://example.test/1','open','head',${fixture.at},${fixture.at})`);
		await tx.execute(sql`INSERT INTO pr_files
			(id,pull_request_id,blob_sha256,filename,mime,size,actor_id,actor_name,actor_kind,created_at)
			VALUES (${ulid()},${prId},${prFile.sha256},'evidence.txt','text/plain',${prFile.size},
			${fixture.actorId},${fixture.ctx.actor.name},${fixture.ctx.actor.kind},${fixture.at})`);
		await tx.execute(sql`INSERT INTO epics
			(id,project_id,slug,name,actor_id,actor_name,actor_kind,created_at,updated_at)
			VALUES (${epicId},${fixture.projectId},'backup','Backup',${fixture.actorId},
			${fixture.ctx.actor.name},${fixture.ctx.actor.kind},${fixture.at},${fixture.at})`);
		await tx.execute(sql`INSERT INTO epic_resources
			(id,epic_id,kind,name,blob_sha256,blob_size,mime,actor_id,actor_name,actor_kind,created_at,updated_at)
			VALUES (${ulid()},${epicId},'file','resource.txt',${resource.sha256},${resource.size},'text/plain',
			${fixture.actorId},${fixture.ctx.actor.name},${fixture.ctx.actor.kind},${fixture.at},${fixture.at})`);
	});
	const taken = await prepareSnapshot(fixture.ctx, {});
	expect(await Bun.file(blobPath(taken.staging, prFile.sha256)).text()).toBe("PR evidence");
	expect(await Bun.file(blobPath(taken.staging, resource.sha256)).text()).toBe("epic resource");
	await archive(taken);
});
