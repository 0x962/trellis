import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { TicketSummarySchema } from "@trellis/api";
import {
	claude,
	linkPr,
	seedActivity,
	seedAttachment,
	seedChild,
	seedComment,
	seedPr,
	seedProject,
	seedTicket,
} from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { ticketList } from "./ticketList.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof ticketList>[1];

const list = (input: Input) => h.db.transaction((tx) => ticketList(tx, input));

describe("ticketList summary rows", () => {
	test("ticketList never returns description or search", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, description: "d".repeat(2048) });
		const page = await list({ projectIds: [rootId] });
		expect(page.items).toHaveLength(1);
		for (const row of page.items) {
			expect(TicketSummarySchema.strict().safeParse(row).success).toBe(true);
			expect(Object.keys(row)).not.toContain("description");
			expect(Object.keys(row)).not.toContain("search");
		}
	});

	test("ticketList fills every summary column", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const web = await seedChild(h.db, rootId, rootId, "web");
		const seed = (statusId: string, extra: { number?: number; parentId?: string } = {}) =>
			seedTicket(h.db, { projectId: web, rootId, statusId, ...extra });
		const ticket = await seed(statuses.started, { number: 7 });
		await seed(statuses.todo, { parentId: ticket });
		await seed(statuses.done, { parentId: ticket });
		for (const body of ["one", "two", "three"]) await seedComment(h.db, ticket, body);
		await seedAttachment(h.db, ticket, { sha256: "a".repeat(64) });
		await seedAttachment(h.db, ticket, { sha256: "b".repeat(64) });
		const failing = await seedPr(h.db, {
			number: 1,
			state: "open",
			ciState: "fail",
			checks: [{ name: "ci", workflow: "CI", bucket: "fail", link: null }],
		});
		const merged = await seedPr(h.db, {
			number: 2,
			state: "merged",
			ciState: "pass",
			checks: [{ name: "ci", workflow: "CI", bucket: "pass", link: null }],
		});
		await linkPr(h.db, ticket, failing);
		await linkPr(h.db, ticket, merged);
		const at = new Date("2026-09-08T10:00:00Z");
		await seedActivity(h.db, { rootId, projectId: web, ticketId: ticket, actor: claude, createdAt: at });

		const page = await list({ projectIds: [web] });
		const row = page.items.find((item) => item.id === ticket)!;
		expect(row).toMatchObject({
			identifier: "CDE-7",
			number: 7,
			childCount: 2,
			childDoneCount: 1,
			commentCount: 3,
			attachmentCount: 2,
			pr: { state: "open", ciState: "fail", pass: 1, fail: 1, pending: 0 },
			lastActor: { name: "claude", kind: "agent", at: at.toISOString() },
			project: { id: web, key: "CDE", path: "CDE.web" },
			status: {
				id: statuses.started,
				slug: "in-progress",
				name: "In Progress",
				category: "started",
				reviewer: null,
				color: "fg",
			},
			parent: null,
			priority: "none",
			version: 1,
			completedAt: null,
		});
		const child = page.items.find((item) => item.parent !== null)!;
		expect(child.parent).toEqual({ id: ticket, identifier: "CDE-7" });
	});
});
