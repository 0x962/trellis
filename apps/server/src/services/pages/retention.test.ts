import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { loadConfig } from "../../config.ts";
import { systemContext } from "../../context.ts";
import { pageHomeFixture } from "../../db/pageHomeFixture.ts";
import { createInlineTransport } from "../../db/transport.ts";
import { createBus } from "../../events/bus.ts";
import { discardPageObject, pageObjectPath, pageTempPath, stagePageObject } from "../../storage/pageObjects.ts";
import { delete as deleteProject } from "../projectsDelete.ts";
import { collectUnheldPageObjects } from "./objects";
import { remove, restore } from "./pages.ts";
import { preparePublish, publish } from "./publish.ts";
import { purgeExpiredPages } from "./retention";
import { PAGE_RETENTION_MS } from "./rows.ts";

let fixture: Awaited<ReturnType<typeof pageHomeFixture>>;
beforeAll(async () => {
	fixture = await pageHomeFixture();
}, 30_000);
afterAll(async () => {
	await fixture.close();
});
const sweep = async () => {
	const result = await fixture.newTx((tx) => purgeExpiredPages(fixture.ctx, tx, {}));
	await fixture.flush();
	return result;
};

test("preserves live, retained deleted, and staged objects at the expiry boundary", async () => {
	await fixture.project("KEEP");
	const live = await fixture.page("KEEP", "Live", "live", "shared");
	const deleted = await fixture.page("KEEP", "Retained", "deleted", "shared");
	await fixture.newTx((tx) => remove(fixture.core, tx, { page: deleted.page.id, expectedVersion: 1 }));
	const staged = await fixture.stage("KEEP", "staged");
	fixture.core.now = new Date(fixture.at.getTime() + 24 * 60 * 60 * 1000 - 1);
	expect(await sweep()).toEqual({ purgedPages: 0, expiredUploads: 0 });
	for (const sha of [live.document.sha256, live.style.sha256, deleted.document.sha256, staged.sha256])
		expect(existsSync(pageObjectPath(fixture.home, sha))).toBe(true);
	fixture.core.now = new Date(fixture.at.getTime() + 24 * 60 * 60 * 1000);
	expect((await sweep()).expiredUploads).toBe(1);
	expect(existsSync(pageObjectPath(fixture.home, staged.sha256))).toBe(false);
	fixture.core.now = new Date(fixture.at.getTime() + PAGE_RETENTION_MS - 1);
	expect((await sweep()).purgedPages).toBe(0);
	expect(existsSync(pageObjectPath(fixture.home, deleted.document.sha256))).toBe(true);
	fixture.core.now = new Date(fixture.at.getTime() + PAGE_RETENTION_MS);
	expect((await sweep()).purgedPages).toBe(1);
	expect(existsSync(pageObjectPath(fixture.home, deleted.document.sha256))).toBe(false);
	expect(existsSync(pageObjectPath(fixture.home, live.style.sha256))).toBe(true);
	expect((await fixture.db.execute(sql`SELECT * FROM page_versions WHERE page_id = ${deleted.page.id}`)).rows).toEqual(
		[],
	);
	expect(fixture.logs.at(-1)).toMatchObject({ message: "page sweep", fields: { purgedPages: 1, removedObjects: 1 } });
	fixture.core.now = fixture.at;
});

test("removes abandoned stages but preserves a prepared upload", async () => {
	const active = (await stagePageObject(fixture.home, new File(["active"], "active.txt")))!;
	await Bun.write(pageTempPath(fixture.home, "abandoned"), "partial");
	await sweep();
	expect(existsSync(pageTempPath(fixture.home, "abandoned"))).toBe(false);
	expect(existsSync(pageTempPath(fixture.home, active.stageId))).toBe(true);
	await discardPageObject(fixture.home, active);
});

test("project deletion releases private objects after commit and keeps objects held by another project", async () => {
	await fixture.project("DROP");
	await fixture.project("OTHER");
	const removed = await fixture.page("DROP", "Remove", "private", "cross-project");
	const kept = await fixture.page("OTHER", "Keep", "other", "cross-project");
	const staged = await fixture.stage("DROP", "private upload");
	await fixture.newTx((tx) => deleteProject(fixture.core, tx, { project: "DROP", force: true }));
	expect(existsSync(pageObjectPath(fixture.home, removed.document.sha256))).toBe(true);
	await fixture.flush();
	expect(existsSync(pageObjectPath(fixture.home, removed.document.sha256))).toBe(false);
	expect(existsSync(pageObjectPath(fixture.home, staged.sha256))).toBe(false);
	expect(existsSync(pageObjectPath(fixture.home, kept.style.sha256))).toBe(true);
});

test("a restored Page survives retention and rollback releases no objects", async () => {
	await fixture.project("ROLL");
	const page = await fixture.page("ROLL", "Restore", "restore", "restore style");
	await fixture.newTx((tx) => remove(fixture.core, tx, { page: page.page.id, expectedVersion: 1 }));
	await fixture.newTx((tx) => restore(fixture.core, tx, { page: page.page.id, expectedVersion: 2 }));
	await expect(
		fixture.newTx(async (tx) => {
			await deleteProject(fixture.core, tx, { project: "ROLL", force: true });
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	fixture.tasks.splice(0);
	await fixture.newTx(fixture.core.cache.rebuild);
	fixture.core.now = new Date(fixture.at.getTime() + PAGE_RETENTION_MS);
	await sweep();
	expect(existsSync(pageObjectPath(fixture.home, page.document.sha256))).toBe(true);
	fixture.core.now = fixture.at;
});

test("keeps every historical version without an age limit", async () => {
	await fixture.project("HIST");
	const page = await fixture.page("HIST", "History", "first version", "first style");
	const next = await fixture.stage("HIST", "second version");
	const prepared = await preparePublish(fixture.ctx, {
		page: page.page.id,
		expectedVersion: 1,
		document: next.id,
		assets: [],
		requestId: crypto.randomUUID(),
		sourcePath: "index.html",
	});
	await fixture.newTx((tx) => publish(fixture.ctx, tx, prepared));
	fixture.core.now = new Date(fixture.at.getTime() + 365 * 24 * 60 * 60 * 1000);
	await sweep();
	for (const sha of [page.document.sha256, page.style.sha256, next.sha256])
		expect(existsSync(pageObjectPath(fixture.home, sha))).toBe(true);
	fixture.core.now = fixture.at;
});

test("asks the database again for each object candidate", async () => {
	await fixture.project("FRESH");
	const first = await fixture.stage("FRESH", "fresh first");
	const second = await fixture.stage("FRESH", "fresh second");
	let reads = 0;
	const result = await collectUnheldPageObjects(
		{
			home: fixture.home,
			newTx: async (fn) => {
				reads++;
				return fixture.newTx(fn);
			},
		},
		[first.sha256, second.sha256],
	);
	expect(reads).toBe(2);
	expect(result.removed).toEqual([]);
});

test("the transport collects Page objects after project deletion commits", async () => {
	await fixture.project("WIRE");
	const page = await fixture.page("WIRE", "Transport", "transport document", "transport style");
	const transport = createInlineTransport({
		db: fixture.db,
		bus: createBus({ bootId: fixture.ctx.bootId }),
		config: loadConfig({ TRELLIS_HOME: fixture.home, TRELLIS_PORT: "0" }),
		runtime: {
			version: "test",
			bootId: fixture.ctx.bootId,
			gh: fixture.ctx.gh,
			ghStatus: fixture.ctx.ghStatus,
			addresses: fixture.ctx.addresses,
		},
	});
	await transport.start();
	try {
		await transport.call(
			"projects.delete",
			{ ...systemContext(), actor: fixture.core.actor },
			{ project: "WIRE", force: true },
		);
		expect(existsSync(pageObjectPath(fixture.home, page.document.sha256))).toBe(false);
		expect(existsSync(pageObjectPath(fixture.home, page.style.sha256))).toBe(false);
	} finally {
		await transport.close();
	}
});
