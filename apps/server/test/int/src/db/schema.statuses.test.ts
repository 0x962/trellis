import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { count, insertRow, seedRoot, seedStatus } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { checkNamed, UNIQUE } from "../../../helpers/errors.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const repo = (projectId: string, owner: string, name: string) =>
	insertRow(h.db, "repos", { id: ulid(), project_id: projectId, owner, repo: name });

describe("repos", () => {
	test("repos keeps owner and repo lowercase, unique per project, and cascades on project delete", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(repo(root, "Acme", "web")).rejects.toThrow(checkNamed("repos_owner_check"));
		await expect(repo(root, "acme", "Web")).rejects.toThrow(checkNamed("repos_repo_check"));
		await repo(root, "acme", "web");
		await expect(repo(root, "acme", "web")).rejects.toThrow(UNIQUE);
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${root}`);
		expect(await count(h.db, "repos")).toBe(0);
	});
});

describe("statuses", () => {
	test("statuses rejects a category outside the set", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(
			seedStatus(h.db, { projectId: root, name: "Blocked", category: "blocked" as "todo", position: 0 }),
		).rejects.toThrow(checkNamed("statuses_category_check"));
		const categories = ["todo", "started", "review", "done", "canceled"] as const;
		for (const [position, category] of categories.entries()) {
			const reviewer = category === "review" ? "human" : null;
			await seedStatus(h.db, { projectId: root, name: category, category, reviewer, position });
		}
		expect(await count(h.db, "statuses")).toBe(5);
	});

	test("statuses ties a reviewer to the review category", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(
			seedStatus(h.db, { projectId: root, name: "Doing", category: "started", reviewer: "human", position: 0 }),
		).rejects.toThrow(checkNamed("statuses_reviewer_for_review"));
		await expect(
			seedStatus(h.db, { projectId: root, name: "Review", category: "review", reviewer: null, position: 1 }),
		).rejects.toThrow(checkNamed("statuses_reviewer_for_review"));
		await seedStatus(h.db, {
			projectId: root,
			name: "Agent Review",
			category: "review",
			reviewer: "agent",
			position: 2,
		});
		await expect(
			seedStatus(h.db, { projectId: root, name: "Bot Review", category: "review", position: 3 }, { reviewer: "bot" }),
		).rejects.toThrow(checkNamed("statuses_reviewer_check"));
	});

	test("statuses rejects a non-positive WIP limit", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(
			seedStatus(h.db, { projectId: root, name: "Zero", category: "started", position: 0, wipLimit: 0 }),
		).rejects.toThrow(checkNamed("statuses_wip_limit_check"));
		await seedStatus(h.db, { projectId: root, name: "Open", category: "started", position: 1, wipLimit: null });
		await seedStatus(h.db, { projectId: root, name: "Three", category: "started", position: 2, wipLimit: 3 });
	});

	test("statuses allows one default per project", async () => {
		const root = await seedRoot(h.db, "CDE");
		await seedStatus(h.db, { projectId: root, name: "Todo", category: "todo", position: 0, isDefault: true });
		await expect(
			seedStatus(h.db, { projectId: root, name: "Backlog", category: "todo", position: 1, isDefault: true }),
		).rejects.toThrow(UNIQUE);
		await seedStatus(h.db, { projectId: root, name: "Later", category: "todo", position: 2, isDefault: false });
		const other = await seedRoot(h.db, "OPS");
		await seedStatus(h.db, { projectId: other, name: "Todo", category: "todo", position: 0, isDefault: true });
	});

	test("statuses keeps name and slug unique per project", async () => {
		const root = await seedRoot(h.db, "CDE");
		await seedStatus(h.db, { projectId: root, name: "Todo", category: "todo", position: 0 });
		await expect(
			seedStatus(h.db, { projectId: root, name: "Todo", slug: "todo-2", category: "todo", position: 1 }),
		).rejects.toThrow(UNIQUE);
		await expect(
			seedStatus(h.db, { projectId: root, name: "To do", slug: "todo", category: "todo", position: 2 }),
		).rejects.toThrow(UNIQUE);
		const other = await seedRoot(h.db, "OPS");
		await seedStatus(h.db, { projectId: other, name: "Todo", category: "todo", position: 0 });
	});

	test("statuses keeps name between 1 and 40 characters", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(
			seedStatus(h.db, { projectId: root, name: "", slug: "empty", category: "todo", position: 0 }),
		).rejects.toThrow(checkNamed("statuses_name_check"));
		await expect(
			seedStatus(h.db, { projectId: root, name: "n".repeat(41), slug: "long", category: "todo", position: 1 }),
		).rejects.toThrow(checkNamed("statuses_name_check"));
	});

	test("statuses cascade on project delete", async () => {
		const root = await seedRoot(h.db, "CDE");
		await seedStatus(h.db, { projectId: root, name: "Todo", category: "todo", position: 0 });
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${root}`);
		expect(await count(h.db, "statuses")).toBe(0);
	});
});
