import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { openDatabase } from "../../../../apps/server/src/db/open.ts";
import { ids, now, receiptFixture } from "../../../../apps/server/src/db/queries/langflowExecution/fixtures/fixture.ts";
import {
	flows,
	harnessAccounts,
	projects,
	pullRequests,
	statuses,
	tickets,
} from "../../../../apps/server/src/db/schema.ts";

export async function createNativeAdapterFixture(home: string) {
	await mkdir(home, { recursive: true, mode: 0o700 });
	await promisify(execFile)("git", ["init", "--quiet", home]);
	await mkdir(join(home, "unused-provider-profile"), { mode: 0o700 });
	const database = await openDatabase(join(home, "db"));
	try {
		await database.db.insert(harnessAccounts).values({
			id: "native-adapter-account",
			name: "Native adapter fixture",
			harness: "codex",
			profilePath: join(home, "unused-provider-profile"),
			createdAt: now,
			updatedAt: now,
		});
		await database.db.insert(projects).values({
			id: ids.project,
			key: "NAT",
			slug: "native-adapter",
			name: "Native adapter fixture",
			directory: home,
			createdAt: now,
			updatedAt: now,
		});
		await database.db.insert(statuses).values({
			id: "native-adapter-status",
			projectId: ids.project,
			name: "Todo",
			slug: "todo",
			category: "todo",
			color: "muted",
			position: 0,
			createdAt: now,
			updatedAt: now,
		});
		await database.db.insert(tickets).values({
			id: ids.ticket,
			projectId: ids.project,
			statusId: "native-adapter-status",
			number: 1,
			title: "Native adapter fixture",
			position: 0,
			createdAt: now,
			updatedAt: now,
		});
		await database.db.insert(pullRequests).values({
			id: ids.diff,
			owner: "fixture",
			repo: "fixture",
			number: 1,
			url: "https://example.test/1",
			state: "open",
			createdAt: now,
			updatedAt: now,
		});
		await database.db.insert(flows).values({
			id: ids.flow,
			projectId: ids.project,
			slug: "native-adapter",
			name: "Native adapter fixture",
			description: "Retain the exact native attempt.",
			briefing: "Read the ticket.",
			version: 1,
			createdAt: now,
			updatedAt: now,
		});
		const { authority } = await receiptFixture(true, database.db);
		await database.db.execute(sql`CREATE TABLE native_adapter_workspace_fixture (
			step_id text PRIMARY KEY, attempt_id text NOT NULL,
			workspace_id text NOT NULL, workspace_commit text
		)`);
		await writeFile(join(home, "adapter.json"), JSON.stringify({ authority }), { mode: 0o600 });
	} finally {
		await database.close();
	}
}
