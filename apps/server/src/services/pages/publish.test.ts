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
import { pull, versions } from "./content.ts";
import { get, remove } from "./pages.ts";
import { publish } from "./publish.ts";
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

const ioContextOf = (actor: ActorRef) =>
	({
		core: contextOf(actor),
		actor,
		session: null,
		home,
		maxUploadBytes: 50 * 1024 * 1024,
		now: () => at,
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

const publishIn = (actor: ActorRef, input: Record<string, unknown>, now = at) =>
	inTx((tx) => publish(contextOf(actor, now), tx, input));

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
		expect(created.page.ref).toBe("PUB/pages/forecast-report");
		expect(created.page.latestVersion).toBe(1);
		expect(created.page.revision).toBe(1);
		expect(created.page.summary).toBe("The forecast of this week.");
		expect(created.version.number).toBe(1);
		expect(created.version.label).toBe("First draft");
		expect(created.version.sourcePath).toBe("reports/forecast/index.html");
		expect(created.version.sourceAgentId).toBe(agentId);
		expect(created.version.documentSize).toBe(15);
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

describe("a second publication", () => {
	test("adds a version, keeps the first one, and raises the revision", async () => {
		const first = await stage(agent, html("<p>One</p>"));
		const page = await publishIn(agent, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Weekly status",
			document: first,
			sourcePath: "status/index.html",
		});
		const second = await stage(agent, html("<p>Two</p>"));
		const next = await publishIn(agent, {
			requestId: crypto.randomUUID(),
			page: page.page.ref,
			expectedVersion: page.page.revision,
			summary: "The status of week two.",
			document: second,
			sourcePath: "status/index.html",
		});
		expect(next.version.number).toBe(2);
		expect(next.page.latestVersion).toBe(2);
		expect(next.page.revision).toBe(page.page.revision + 1);
		expect(next.page.summary).toBe("The status of week two.");
		expect(next.page.slug).toBe(page.page.slug);

		const history = await inTx((tx) => versions(contextOf(agent), tx, { page: page.page.ref }));
		expect(history.items.map((version) => version.number)).toEqual([2, 1]);
		expect(history.nextCursor).toBeNull();
		const older = await inTx((tx) => pull(contextOf(agent), tx, { page: page.page.ref, version: 1 }));
		expect(older.version.documentSha256).toBe(page.version.documentSha256);
	});

	test("refuses a stale revision and writes no version", async () => {
		const first = await stage(human, html("<p>Base</p>"));
		const page = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Stale check",
			document: first,
			sourcePath: "index.html",
		});
		const second = await stage(human, html("<p>Stale</p>"));
		await expect(
			publishIn(human, {
				requestId: crypto.randomUUID(),
				page: page.page.ref,
				expectedVersion: page.page.revision + 1,
				document: second,
				sourcePath: "index.html",
			}),
		).rejects.toThrow("The page changed since the revision you sent.");
		const detail = await inTx((tx) => get(contextOf(human), tx, { page: page.page.ref }));
		expect(detail.latestVersion).toBe(1);
	});

	test("returns the first result for a repeated request identifier", async () => {
		const document = await stage(human, html("<p>Once</p>"));
		const requestId = crypto.randomUUID();
		const created = await publishIn(human, {
			requestId,
			project: project.key,
			title: "Idempotent report",
			document,
			sourcePath: "index.html",
		});
		const other = await stage(human, html("<p>Twice</p>"));
		const repeated = await publishIn(human, {
			requestId,
			project: project.key,
			title: "Idempotent report",
			document: other,
			sourcePath: "index.html",
		});
		expect(repeated.page.id).toBe(created.page.id);
		expect(repeated.version.number).toBe(1);
		expect(repeated.version.documentSha256).toBe(created.version.documentSha256);
		const pages = await db.execute(
			sql`SELECT id FROM pages WHERE project_id = ${project.id} AND title = 'Idempotent report'`,
		);
		expect(pages.rows.length).toBe(1);
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

	test("takes one upload for two asset paths", async () => {
		const document = await stage(human, html("<p>Shared</p>"));
		const shared = await stage(human, new File(["x"], "pixel.png", { type: "image/png" }));
		const created = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Shared asset",
			document,
			assets: [
				{ uploadId: shared, path: "a/pixel.png" },
				{ uploadId: shared, path: "b/pixel.png" },
			],
			sourcePath: "index.html",
		});
		const content = await inTx((tx) => pull(contextOf(human), tx, { page: created.page.ref }));
		expect(content.assets.map((asset) => asset.path)).toEqual(["a/pixel.png", "b/pixel.png"]);
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
