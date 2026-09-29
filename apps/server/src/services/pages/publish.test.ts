import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActorRef, PagePublishOutputSchema, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { pull } from "./content.ts";
import { get, remove } from "./pages.ts";
import { preparePublish, publish } from "./publish.ts";
import { prepareUpload, upload } from "./uploads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const cache = createCache();
const events: TrellisEvent[] = [];
const at = new Date("2026-09-24T18:00:00.000Z");
const human = { name: "Navid", kind: "human" as const };
const agentId = ulid();
const agent = { name: agentId, kind: "agent" as const };
const stranger = { name: "Other", kind: "human" as const };
const project = { id: ulid(), key: "PUB", slug: "publish" };
const archived = { id: ulid(), key: "ARC", slug: "archived" };

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const contextOf = (actor: ActorRef | null, now = at): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now,
	emit: (event) => events.push(event),
	cache,
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
});

const ioContextOf = (actor: ActorRef, now = at) =>
	({
		core: contextOf(actor, now),
		actor,
		session: null,
		home,
		now: () => now,
		log: () => {},
		newTx: inTx,
		afterCommit: () => {},
	}) as unknown as IoCtx & PrepareCtx;

// Stages one file and returns its upload identifier, the way the CLI stages
// a document or an asset before it publishes.
const stage = async (actor: ActorRef, file: File, projectKey = project.key) => {
	const ctx = ioContextOf(actor);
	const prepared = await prepareUpload(ctx, { project: projectKey, file });
	const stored = await inTx((tx) => upload(ctx, tx, prepared));
	return stored.id;
};

const html = (body: string) => new File([body], "index.html", { type: "text/html" });

const publishIn = async (actor: ActorRef, input: Record<string, unknown>, now = at) => {
	const ctx = ioContextOf(actor, now);
	const prepared = await preparePublish(ctx, input);
	return inTx((tx) => publish(ctx, tx, prepared));
};

const insertProject = (row: typeof project, archivedAt: Date | null = null) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, archived_at, created_at, updated_at)
		VALUES (${row.id}, ${row.key}, ${row.slug}, ${row.key}, ${archivedAt}, ${at}, ${at})`);

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-publish-"));
	db = await openTestDb();
	await insertProject(project);
	await insertProject(archived, at);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${agent.name}, ${agent.kind}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs (
		id, name, kind, instruction, project_id, project_key, created_at, updated_at
	) VALUES (${agentId}, 'Page agent', 'agent', 'Publish a page.', ${project.id}, ${project.key}, ${at}, ${at})`);
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

describe("a first publication", () => {
	test("creates the page, its first version, and its assets", async () => {
		const document = await stage(agent, html("<p>Forecast</p>"));
		const style = await stage(agent, new File(["body{}"], "main.css", { type: "text/css" }));
		const requestId = crypto.randomUUID();
		const created = await publishIn(agent, {
			requestId,
			project: project.key,
			title: "Forecast report",
			summary: "The forecast of this week.",
			label: "First draft",
			document,
			assets: [{ uploadId: style, path: "styles/main.css" }],
			sourcePath: "reports/forecast/index.html",
		});
		expect(PagePublishOutputSchema.parse(created)).toBeDefined();
		expect(created.link).toBe(`trellis://page/${created.page.id}`);
		expect(created.page.ref).toBe("PUB/pages/forecast-report");
		expect(created.page.latestVersion).toBe(1);
		expect(created.page.watcher?.agent.id).toBe(agentId);
		expect(created.page.revision).toBe(1);
		expect(created.page.summary).toBe("The forecast of this week.");
		expect(created.version.number).toBe(1);
		expect(created.version.label).toBe("First draft");
		expect(created.version.sourcePath).toBe("reports/forecast/index.html");
		expect(created.version.sourceAgentId).toBe(agentId);
		expect(created.version.documentSize).toBe(15);
		expect(
			(await db.execute(sql`SELECT search_text FROM page_versions WHERE page_id = ${created.page.id}`)).rows,
		).toEqual([{ search_text: "Forecast" }]);
		expect(events.at(-1)).toEqual({ type: "pages.changed", projectId: project.id, pageId: created.page.id });

		const detail = await inTx((tx) => get(contextOf(agent), tx, { page: created.page.ref }));
		expect(detail.assetCount).toBe(1);
		const content = await inTx((tx) => pull(contextOf(agent), tx, { page: created.page.ref }));
		expect(content.assets).toEqual([
			{
				pageId: created.page.id,
				version: 1,
				path: "styles/main.css",
				sha256: content.assets[0]!.sha256,
				size: 6,
				mime: "text/css",
			},
		]);
	});

	test("consumes the staged uploads and keeps their objects", async () => {
		const document = await stage(agent, html("<p>Consumed</p>"));
		const created = await publishIn(agent, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Consumed report",
			document,
			sourcePath: "index.html",
		});
		const staged = await db.execute(sql`SELECT id FROM page_uploads WHERE id = ${document}`);
		expect(staged.rows).toEqual([]);
		const file = Bun.file(
			join(home, "pages", "objects", created.version.documentSha256.slice(0, 2), created.version.documentSha256),
		);
		expect(await file.exists()).toBe(true);
	});

	test("publishes recorded sizes above the former document and asset limits", async () => {
		const document = await stage(human, html("<p>Large report</p>"));
		const firstAsset = await stage(human, new File(["a"], "first.bin"));
		const secondAsset = await stage(human, new File(["b"], "second.bin"));
		const documentSize = 16 * 1024 * 1024 + 1;
		const firstAssetSize = 130 * 1024 * 1024;
		const secondAssetSize = 121 * 1024 * 1024;
		await db.execute(sql`UPDATE page_uploads SET size = ${documentSize} WHERE id = ${document}`);
		await db.execute(sql`UPDATE page_uploads SET size = ${firstAssetSize} WHERE id = ${firstAsset}`);
		await db.execute(sql`UPDATE page_uploads SET size = ${secondAssetSize} WHERE id = ${secondAsset}`);

		const created = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Large report",
			document,
			assets: [
				{ uploadId: firstAsset, path: "first.bin" },
				{ uploadId: secondAsset, path: "second.bin" },
			],
			sourcePath: "index.html",
		});
		const content = await inTx((tx) => pull(contextOf(human), tx, { page: created.page.ref }));

		expect(created.version.documentSize).toBe(documentSize);
		expect(content.assets.map((asset) => asset.size)).toEqual([firstAssetSize, secondAssetSize]);
		expect(content.assets.reduce((total, asset) => total + asset.size, 0)).toBe(251 * 1024 * 1024);
	});

	test("gives a second page of the same title its own slug", async () => {
		const document = await stage(human, html("<p>Twin</p>"));
		const created = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Forecast report",
			document,
			sourcePath: "index.html",
		});
		expect(created.page.slug).toBe("forecast-report-2");
		expect(created.version.sourceAgentId).toBeNull();
	});

	test("refuses an archived project", async () => {
		const document = await stage(human, html("<p>No</p>"));
		await expect(
			publishIn(human, {
				requestId: crypto.randomUUID(),
				project: archived.key,
				title: "Archived report",
				document,
				sourcePath: "index.html",
			}),
		).rejects.toThrow("The project is archived. Unarchive it before a change.");
	});
});

describe("the staged uploads of a publication", () => {
	test("refuses an upload of another actor", async () => {
		const document = await stage(stranger, html("<p>Mine</p>"));
		await expect(
			publishIn(human, {
				requestId: crypto.randomUUID(),
				project: project.key,
				title: "Borrowed upload",
				document,
				sourcePath: "index.html",
			}),
		).rejects.toThrow("No row matches the ref.");
	});

	test("refuses an upload past its expiry", async () => {
		const document = await stage(human, html("<p>Old</p>"));
		const tomorrow = new Date(at.getTime() + 25 * 60 * 60 * 1000);
		await expect(
			publishIn(
				human,
				{
					requestId: crypto.randomUUID(),
					project: project.key,
					title: "Expired upload",
					document,
					sourcePath: "index.html",
				},
				tomorrow,
			),
		).rejects.toThrow("No row matches the ref.");
	});

	test("takes one upload for more than 200 asset paths", async () => {
		const document = await stage(human, html("<p>Shared</p>"));
		const shared = await stage(human, new File(["x"], "pixel.png", { type: "image/png" }));
		const created = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Shared asset",
			document,
			assets: Array.from({ length: 201 }, (_, index) => ({ uploadId: shared, path: `asset-${index}.png` })),
			sourcePath: "index.html",
		});
		const content = await inTx((tx) => pull(contextOf(human), tx, { page: created.page.ref }));
		expect(content.assets).toHaveLength(201);
		expect(content.assets[0]!.path).toBe("asset-0.png");
		expect(content.assets.at(-1)!.path).toBe("asset-99.png");
	});
});

describe("a deleted page", () => {
	test("serves no source archive", async () => {
		const document = await stage(human, html("<p>Retained</p>"));
		const created = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Retained report",
			document,
			sourcePath: "index.html",
		});
		await inTx((tx) =>
			remove(contextOf(human), tx, { page: created.page.ref, expectedVersion: created.page.revision }),
		);
		await expect(inTx((tx) => pull(contextOf(human), tx, { page: created.page.ref }))).rejects.toThrow(
			"No row matches the ref.",
		);
	});
});
