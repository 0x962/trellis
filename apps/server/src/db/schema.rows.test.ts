import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	claude,
	count,
	dana,
	insertRow,
	linkPr,
	seedActivity,
	seedActor,
	seedAttachment,
	seedChild,
	seedComment,
	seedPr,
	seedProject,
	seedTicket,
} from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { checkNamed, FOREIGN_KEY, UNIQUE } from "../../test/helpers/errors.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const seedOneTicket = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	return { rootId, statuses, ticket };
};

describe("comments", () => {
	test("comments keep body between 1 and 200000 characters, need a known actor, and cascade on ticket delete", async () => {
		const { ticket } = await seedOneTicket();
		await expect(seedComment(h.db, ticket, "")).rejects.toThrow(checkNamed("comments_body_check"));
		await expect(seedComment(h.db, ticket, "b".repeat(200_001))).rejects.toThrow(checkNamed("comments_body_check"));
		await expect(seedComment(h.db, ticket, "hi", { name: "ghost", kind: "human" })).rejects.toThrow(FOREIGN_KEY);
		await seedComment(h.db, ticket, "b".repeat(200_000));
		await h.db.execute(sql`DELETE FROM tickets WHERE id = ${ticket}`);
		expect(await count(h.db, "comments")).toBe(0);
	});
});

describe("attachments", () => {
	test("attachments keep filename, size, and sha256 in their grammar and cascade on ticket delete", async () => {
		const { ticket } = await seedOneTicket();
		for (const filename of ["a/b.txt", "", "f".repeat(256)]) {
			await expect(seedAttachment(h.db, ticket, { filename })).rejects.toThrow(
				checkNamed("attachments_filename_check"),
			);
		}
		await expect(seedAttachment(h.db, ticket, { size: 0 })).rejects.toThrow(checkNamed("attachments_size_check"));
		await expect(seedAttachment(h.db, ticket, { sha256: "ABC" })).rejects.toThrow(
			checkNamed("attachments_sha256_check"),
		);
		await seedAttachment(h.db, ticket);
		await h.db.execute(sql`DELETE FROM tickets WHERE id = ${ticket}`);
		expect(await count(h.db, "attachments")).toBe(0);
	});
});

describe("pull_requests", () => {
	test("pull_requests keep every closed set, the lowercase owner and repo, the array checks, and the unique number", async () => {
		await expect(seedPr(h.db, { number: 1, owner: "Acme" })).rejects.toThrow(checkNamed("pull_requests_owner_check"));
		await expect(seedPr(h.db, { number: 0 })).rejects.toThrow(checkNamed("pull_requests_number_check"));
		await expect(seedPr(h.db, { number: 1, state: "draft" as "open" })).rejects.toThrow(
			checkNamed("pull_requests_state_check"),
		);
		await expect(seedPr(h.db, { number: 1, reviewState: "pending" })).rejects.toThrow(
			checkNamed("pull_requests_review_state_check"),
		);
		await expect(seedPr(h.db, { number: 1, ciState: "green" as "none" })).rejects.toThrow(
			checkNamed("pull_requests_ci_state_check"),
		);
		await expect(seedPr(h.db, { number: 1 }, { checks: {} })).rejects.toThrow(checkNamed("pull_requests_checks_check"));
		await seedPr(h.db, { number: 1 });
		await expect(seedPr(h.db, { number: 1 })).rejects.toThrow(UNIQUE);
	});
});

describe("ticket_pull_requests", () => {
	test("ticket_pull_requests keeps one link per pair with a known source and cascades from both sides", async () => {
		const { rootId, statuses, ticket } = await seedOneTicket();
		const pr = await seedPr(h.db, { number: 1 });
		await linkPr(h.db, ticket, pr);
		await expect(linkPr(h.db, ticket, pr)).rejects.toThrow(UNIQUE);
		const second = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await expect(linkPr(h.db, second, pr, dana, "scan")).rejects.toThrow(
			checkNamed("ticket_pull_requests_source_check"),
		);
		await h.db.execute(sql`DELETE FROM tickets WHERE id = ${ticket}`);
		expect(await count(h.db, "ticket_pull_requests")).toBe(0);
		await linkPr(h.db, second, pr);
		await h.db.execute(sql`DELETE FROM pull_requests WHERE id = ${pr}`);
		expect(await count(h.db, "ticket_pull_requests")).toBe(0);
	});
});

describe("activity", () => {
	test("activity ids come from the identity and a description row carries no values", async () => {
		const { rootId, ticket } = await seedOneTicket();
		const first = await seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket });
		const second = await seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket });
		expect(first).toBe(1);
		expect(second).toBe(2);
		const meta = await h.db.execute(sql`SELECT meta FROM activity WHERE id = ${first}`);
		expect(meta.rows[0]?.meta).toEqual({});
		await expect(
			seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket, field: "description", toValue: "text" }),
		).rejects.toThrow(checkNamed("activity_description_check"));
		await seedActivity(h.db, {
			rootId,
			projectId: rootId,
			ticketId: ticket,
			field: "description",
			meta: { deltaChars: 12 },
		});
	});

	test("activity cascades from ticket, project, and root and needs a known actor", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const child = await seedChild(h.db, rootId, rootId, "web");
		const ticket = await seedTicket(h.db, { projectId: child, rootId, statusId: statuses.todo });
		await seedActivity(h.db, { rootId, projectId: child, ticketId: ticket, actor: claude });
		await h.db.execute(sql`DELETE FROM tickets WHERE id = ${ticket}`);
		expect(await count(h.db, "activity")).toBe(0);

		await seedActivity(h.db, { rootId, projectId: child, ticketId: null });
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${child}`);
		expect(await count(h.db, "activity")).toBe(0);

		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: null });
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${rootId}`);
		expect(await count(h.db, "activity")).toBe(0);

		const other = await seedProject(h.db, "OPS");
		await expect(
			seedActivity(h.db, { rootId: other.rootId, projectId: other.rootId, actor: { name: "ghost", kind: "agent" } }),
		).rejects.toThrow(FOREIGN_KEY);
	});
});

describe("actors", () => {
	test("actors keep name printable without a colon and key by name and kind", async () => {
		await expect(seedActor(h.db, { name: "a:b", kind: "human" })).rejects.toThrow(checkNamed("actors_name_check"));
		await expect(seedActor(h.db, { name: "", kind: "human" })).rejects.toThrow(checkNamed("actors_name_check"));
		await expect(seedActor(h.db, { name: "n".repeat(65), kind: "human" })).rejects.toThrow(
			checkNamed("actors_name_check"),
		);
		await expect(seedActor(h.db, { name: "nav", kind: "bot" as "human" })).rejects.toThrow(
			checkNamed("actors_kind_check"),
		);
		await seedActor(h.db, { name: "nav", kind: "human" });
		await seedActor(h.db, { name: "nav", kind: "agent" });
		await expect(seedActor(h.db, { name: "nav", kind: "agent" })).rejects.toThrow(UNIQUE);
	});
});

describe("settings", () => {
	test("settings keys by key and stores jsonb", async () => {
		const setting = { key: "stalledHours", value: 48, updated_at: new Date() };
		await insertRow(h.db, "settings", setting);
		await expect(insertRow(h.db, "settings", setting)).rejects.toThrow(UNIQUE);
		const result = await h.db.execute(sql`SELECT value FROM settings WHERE key = 'stalledHours'`);
		expect(result.rows[0]?.value).toBe(48);
	});
});
