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
import { gcPageObjects } from "./objects.ts";
import { remove, restore } from "./pages.ts";
import { publish } from "./publish.ts";
import { retention } from "./retention.ts";
import { PAGE_RETENTION_MS } from "./rows.ts";

let h: Awaited<ReturnType<typeof pageHomeFixture>>;
beforeAll(async () => {
	h = await pageHomeFixture();
}, 30_000);
afterAll(async () => {
	await h.close();
});
const sweep = async () => {
	const result = await h.newTx((tx) => retention(h.ctx, tx, {}));
	await h.flush();
	return result;
};

test("preserves live, retained deleted, and staged objects at the expiry boundary", async () => {
	await h.project("KEEP");
	const live = await h.page("KEEP", "Live", "live", "shared");
	const deleted = await h.page("KEEP", "Retained", "deleted", "shared");
	await h.newTx((tx) => remove(h.core, tx, { page: deleted.page.id, expectedVersion: 1 }));
	const staged = await h.stage("KEEP", "staged");
	h.core.now = new Date(h.at.getTime() + 24 * 60 * 60 * 1000 - 1);
	expect(await sweep()).toEqual({ purgedPages: 0, expiredUploads: 0 });
	for (const sha of [live.document.sha256, live.style.sha256, deleted.document.sha256, staged.sha256])
		expect(existsSync(pageObjectPath(h.home, sha))).toBe(true);
	h.core.now = new Date(h.at.getTime() + 24 * 60 * 60 * 1000);
	expect((await sweep()).expiredUploads).toBe(1);
	expect(existsSync(pageObjectPath(h.home, staged.sha256))).toBe(false);
	h.core.now = new Date(h.at.getTime() + PAGE_RETENTION_MS - 1);
	expect((await sweep()).purgedPages).toBe(0);
	expect(existsSync(pageObjectPath(h.home, deleted.document.sha256))).toBe(true);
	h.core.now = new Date(h.at.getTime() + PAGE_RETENTION_MS);
	expect((await sweep()).purgedPages).toBe(1);
	expect(existsSync(pageObjectPath(h.home, deleted.document.sha256))).toBe(false);
	expect(existsSync(pageObjectPath(h.home, live.style.sha256))).toBe(true);
	expect((await h.db.execute(sql`SELECT * FROM page_versions WHERE page_id = ${deleted.page.id}`)).rows).toEqual([]);
	expect(h.logs.at(-1)).toMatchObject({ message: "page sweep", fields: { purgedPages: 1, removedObjects: 1 } });
	h.core.now = h.at;
});

test("removes abandoned stages but preserves a prepared upload", async () => {
	const active = (await stagePageObject(h.home, new File(["active"], "active.txt")))!;
	await Bun.write(pageTempPath(h.home, "abandoned"), "partial");
	await sweep();
	expect(existsSync(pageTempPath(h.home, "abandoned"))).toBe(false);
	expect(existsSync(pageTempPath(h.home, active.stageId))).toBe(true);
	await discardPageObject(h.home, active);
});

test("project deletion releases private objects after commit and keeps objects held by another project", async () => {
	await h.project("DROP");
	await h.project("OTHER");
	const removed = await h.page("DROP", "Remove", "private", "cross-project");
	const kept = await h.page("OTHER", "Keep", "other", "cross-project");
	const staged = await h.stage("DROP", "private upload");
	await h.newTx((tx) => deleteProject(h.core, tx, { project: "DROP", force: true }));
	expect(existsSync(pageObjectPath(h.home, removed.document.sha256))).toBe(true);
	await h.flush();
	expect(existsSync(pageObjectPath(h.home, removed.document.sha256))).toBe(false);
	expect(existsSync(pageObjectPath(h.home, staged.sha256))).toBe(false);
	expect(existsSync(pageObjectPath(h.home, kept.style.sha256))).toBe(true);
});

test("a restored Page survives retention and rollback releases no objects", async () => {
	await h.project("ROLL");
	const page = await h.page("ROLL", "Restore", "restore", "restore style");
	await h.newTx((tx) => remove(h.core, tx, { page: page.page.id, expectedVersion: 1 }));
	await h.newTx((tx) => restore(h.core, tx, { page: page.page.id, expectedVersion: 2 }));
	await expect(
		h.newTx(async (tx) => {
			await deleteProject(h.core, tx, { project: "ROLL", force: true });
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	h.tasks.splice(0);
	await h.newTx(h.core.cache.rebuild);
	h.core.now = new Date(h.at.getTime() + PAGE_RETENTION_MS);
	await sweep();
	expect(existsSync(pageObjectPath(h.home, page.document.sha256))).toBe(true);
	h.core.now = h.at;
});

test("keeps every historical version without an age limit", async () => {
	await h.project("HIST");
	const page = await h.page("HIST", "History", "first version", "first style");
	const next = await h.stage("HIST", "second version");
	await h.newTx((tx) =>
		publish(h.core, tx, {
			page: page.page.id,
			expectedVersion: 1,
			document: next.id,
			assets: [],
			requestId: crypto.randomUUID(),
			sourcePath: "index.html",
		}),
	);
	h.core.now = new Date(h.at.getTime() + 365 * 24 * 60 * 60 * 1000);
	await sweep();
	for (const sha of [page.document.sha256, page.style.sha256, next.sha256])
		expect(existsSync(pageObjectPath(h.home, sha))).toBe(true);
	h.core.now = h.at;
});

test("asks the database again for each object candidate", async () => {
	await h.project("FRESH");
	const first = await h.stage("FRESH", "fresh first");
	const second = await h.stage("FRESH", "fresh second");
	let reads = 0;
	const result = await gcPageObjects(
		{
			home: h.home,
			newTx: async (fn) => {
				reads++;
				return h.newTx(fn);
			},
		},
		[first.sha256, second.sha256],
	);
	expect(reads).toBe(2);
	expect(result.removed).toEqual([]);
});

test("the transport collects Page objects after project deletion commits", async () => {
	await h.project("WIRE");
	const page = await h.page("WIRE", "Transport", "transport document", "transport style");
	const transport = createInlineTransport({
		db: h.db,
		bus: createBus({ bootId: h.ctx.bootId }),
		config: loadConfig({ TRELLIS_HOME: h.home, TRELLIS_PORT: "0" }),
		runtime: {
			version: "test",
			bootId: h.ctx.bootId,
			gh: h.ctx.gh,
			ghStatus: h.ctx.ghStatus,
			addresses: h.ctx.addresses,
		},
	});
	await transport.start();
	try {
		await transport.call(
			"projects.delete",
			{ ...systemContext(), actor: h.core.actor },
			{ project: "WIRE", force: true },
		);
		expect(existsSync(pageObjectPath(h.home, page.document.sha256))).toBe(false);
		expect(existsSync(pageObjectPath(h.home, page.style.sha256))).toBe(false);
	} finally {
		await transport.close();
	}
});
