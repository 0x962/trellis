import { ids, now } from "../../../../../db/queries/langflowExecution/fixtures/fixture";
import { flows, projects, pullRequests, statuses, tickets } from "../../../../../db/schema";
import { openTestDb } from "../../../../../db/testDb";

export async function migratedDatabase() {
	const db = await openTestDb();
	await db.insert(projects).values({
		id: ids.project,
		key: "TRL",
		slug: "trl",
		name: "Trellis",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(statuses).values({
		id: "stop-status",
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
		statusId: "stop-status",
		number: 1,
		title: "Stop fixture",
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
		slug: "stop-fixture",
		name: "Stop fixture",
		description: "Stop the exact attempt.",
		briefing: "Read the ticket.",
		version: 1,
		createdAt: now,
		updatedAt: now,
	});
	return db;
}
