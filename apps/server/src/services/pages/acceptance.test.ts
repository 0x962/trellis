import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { pageObjectPath } from "../../storage/pageObjects.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { createPageComment, listPageComments, replyToPageComment, setPageCommentResolved } from "./comments";
import { pull, versionFile, versions } from "./content.ts";
import { get, list, remove, restore, update } from "./pages.ts";
import { preparePublish, publish } from "./publish.ts";
import { searchPages } from "./search.ts";
import { prepareUpload, upload } from "./uploads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const cache = createCache();
const events: TrellisEvent[] = [];
const now = new Date("2026-09-26T00:00:00Z");
const projectId = ulid();
const agentId = ulid();
const agent = { name: agentId, kind: "agent" as const };
const human = { name: "Acceptance reader", kind: "human" as const };
const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const contextOf = (actor: ActorRef): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now,
	cache,
	actorCache: new Map(),
	emit: (event) => events.push(event),
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
});
const io = {
	core: contextOf(agent),
	actor: agent,
	session: null,
	get home() {
		return home;
	},
	maxUploadBytes: 50 * 1024 * 1024,
	now: () => now,
	log: () => {},
	newTx: inTx,
	afterCommit: () => {},
} as unknown as IoCtx & PrepareCtx;
const stage = async (body: string, name: string, type: string) => {
	const prepared = await prepareUpload(io, { project: "QA", file: new File([body], name, { type }) });
	return (await inTx((tx) => upload(io, tx, prepared))).id;
};
const publishIn = async (input: Record<string, unknown>) => {
	const prepared = await preparePublish(io, {
		requestId: crypto.randomUUID(),
		sourcePath: "report/index.html",
		...input,
	});
	return inTx((tx) => publish(io, tx, prepared));
};

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-pages-acceptance-"));
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'QA', 'qa', 'Acceptance', ${now}, ${now})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${agent.name}, ${agent.kind}, ${now}, ${now})`);
	await db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, created_at, updated_at)
		VALUES (${agentId}, 'Publisher', 'agent', 'Publish the report.', ${projectId}, 'QA', ${now}, ${now})`);
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
	await rm(home, { recursive: true, force: true });
});

test("publish, comment, revise, history, source, Search, delete, and restore keep one Page identity", async () => {
	const firstHtml = "<!doctype html><html><body><main>Oldquartz forecast</main></body></html>\r\n";
	const firstCss = "main { color: green; }\n";
	const first = await publishIn({
		project: "QA",
		title: "Release report",
		document: await stage(firstHtml, "index.html", "text/html"),
		assets: [
			{ path: "styles/main.css", uploadId: await stage(firstCss, "main.css", "text/css") },
			{ path: "data/empty.txt", uploadId: await stage("", "empty.txt", "text/plain") },
		],
	});
	const page = first.page.ref;
	expect(first.link).toBe(`trellis://page/${first.page.id}`);
	const thread = await inTx((tx) =>
		createPageComment(contextOf(human), tx, {
			page,
			version: 1,
			anchor: {
				kind: "text",
				path: "html>body:nth-of-type(1)>main:nth-of-type(1)",
				quote: "Oldquartz",
				prefix: "",
				suffix: " forecast",
			},
			body: "Update the forecast.",
		}),
	);
	expect((await inTx((tx) => get(contextOf(agent), tx, { page }))).openThreadCount).toBe(1);
	const renamed = await inTx((tx) =>
		update(contextOf(agent), tx, { page, title: "Reviewed report", expectedVersion: 1 }),
	);
	expect(renamed.revision).toBe(2);
	expect(renamed.latestVersion).toBe(1);
	expect(renamed.ref).toBe(page);
	const document = await stage("<main>Newberyl forecast</main>", "index.html", "text/html");
	await expect(publishIn({ page, document, expectedVersion: 1 })).rejects.toThrow(
		"The page changed since the revision you sent.",
	);
	const second = await publishIn({ page, document, expectedVersion: renamed.revision });
	expect(second.page.id).toBe(first.page.id);
	expect(second.page.revision).toBe(3);
	expect(second.version.number).toBe(2);
	await inTx((tx) =>
		replyToPageComment(contextOf(agent), tx, { thread: thread.id, body: "Version two updates the forecast." }),
	);
	await inTx((tx) => setPageCommentResolved(contextOf(agent), tx, { thread: thread.id, resolved: true }));
	const comments = await inTx((tx) => listPageComments(contextOf(human), tx, { page, version: 1 }));
	expect(comments[0]).toMatchObject({ id: thread.id, version: 1, selectedText: "Oldquartz" });
	expect(comments[0]!.comments.map((comment) => comment.body)).toEqual([
		"Update the forecast.",
		"Version two updates the forecast.",
	]);
	expect(comments[0]!.resolved).not.toBeNull();
	expect(await inTx((tx) => listPageComments(contextOf(human), tx, { page, version: 2 }))).toEqual([]);
	await expect(
		inTx((tx) =>
			createPageComment(contextOf(human), tx, {
				page,
				version: 1,
				anchor: { kind: "element", path: "main" },
				body: "Old version",
			}),
		),
	).rejects.toThrow("Comment on the latest Page version.");

	const history = await inTx((tx) => versions(contextOf(agent), tx, { page }));
	expect(history.items.map((entry) => entry.number)).toEqual([2, 1]);
	const old = await inTx((tx) => pull(contextOf(agent), tx, { page, version: 1 }));
	expect(await Bun.file(pageObjectPath(home, old.version.documentSha256)).text()).toBe(firstHtml);
	expect(old.assets.map((asset) => asset.path)).toEqual(["data/empty.txt", "styles/main.css"]);
	expect(await Bun.file(pageObjectPath(home, old.assets[1]!.sha256)).text()).toBe(firstCss);
	expect(old.assets[0]!.size).toBe(0);
	expect((await inTx((tx) => pull(contextOf(agent), tx, { page }))).assets).toEqual([]);
	const search = (q: string) => inTx((tx) => searchPages(contextOf(human), tx, { q, limit: 20 }));
	expect((await search("Newberyl")).map((item) => item.id)).toEqual([first.page.id]);
	expect(await search("Oldquartz")).toEqual([]);

	const deleted = await inTx((tx) => remove(contextOf(human), tx, { page, expectedVersion: second.page.revision }));
	expect(deleted.deletedAt).not.toBeNull();
	expect(await search("Newberyl")).toEqual([]);
	expect((await inTx((tx) => list(contextOf(human), tx, { project: "QA" }))).items).toEqual([]);
	expect(
		await inTx((tx) => versionFile(contextOf(human), tx, { pageId: first.page.id, version: 1, path: "index.html" })),
	).toEqual({ state: "deleted" });
	const restored = await inTx((tx) => restore(contextOf(human), tx, { page, expectedVersion: deleted.revision }));
	expect(restored.ref).toBe(page);
	expect(restored.latestVersion).toBe(2);
	expect(restored.watcher).toBeNull();
	expect((await search("Newberyl")).map((item) => item.id)).toEqual([first.page.id]);
	expect((await inTx((tx) => pull(contextOf(agent), tx, { page, version: 1 }))).version.documentSha256).toBe(
		first.version.documentSha256,
	);
	expect((await inTx((tx) => listPageComments(contextOf(human), tx, { page }))).map((item) => item.id)).toEqual([
		thread.id,
	]);
	expect(events.some((event) => event.type === "page-comments.changed")).toBe(true);
});
