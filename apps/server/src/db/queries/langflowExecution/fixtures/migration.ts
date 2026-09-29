import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "../../../client";
import { flowExecutions, flows, projects, pullRequests, statuses, tickets } from "../../../schema";
import { ids, now } from "./fixture";

export const migrationsDir = join(import.meta.dir, "../../../../../drizzle");
export async function beforeDocuments() {
	const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx < 133);
	const directory = await mkdtemp(join(tmpdir(), "trellis-langflow-migration-"));
	await mkdir(join(directory, "meta"));
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	const db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	await rm(directory, { recursive: true });
	await seed(db);
	return db;
}
async function seed(db: Db) {
	await db
		.insert(projects)
		.values({ id: ids.project, key: "TRL", slug: "trl", name: "Trellis", createdAt: now, updatedAt: now });
	await db.insert(statuses).values({
		id: "status-1",
		projectId: ids.project,
		name: "Todo",
		slug: "todo",
		category: "todo",
		color: "muted",
		position: 0,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(tickets).values({
		id: ids.ticket,
		projectId: ids.project,
		statusId: "status-1",
		number: 1,
		title: "Keep this ticket",
		position: 0,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(pullRequests).values({
		id: ids.diff,
		owner: "fixture",
		repo: "fixture",
		number: 1,
		url: "https://example.test/1",
		state: "open",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(flows).values({
		id: ids.flow,
		projectId: ids.project,
		slug: "receipt-migration-fixture",
		name: "Review",
		description: "Review a proposed change.",
		briefing: "Read the ticket.",
		version: 1,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(flowExecutions).values({
		id: "legacy-execution",
		flowId: ids.flow,
		ticketId: ids.ticket,
		projectId: ids.project,
		actorKind: "human",
		actorName: "fixture",
		requestId: "legacy-request",
		request: { retained: true },
		doc: { retained: true },
		state: { status: "succeeded" },
		revision: 1,
		createdAt: now,
		updatedAt: now,
	});
}
