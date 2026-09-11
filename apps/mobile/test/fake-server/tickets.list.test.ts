import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { TicketSummarySchema } from "@trellis/api";
import { createFakeServer } from "./index";

const byUpdatedThenId = (a: { updatedAt: string; id: string }, b: { updatedAt: string; id: string }) => {
	if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
	return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
};

describe("fake server tickets.list", () => {
	// WS-112. The default order is -updatedAt with id desc as the tiebreak.
	// The CDE subtree holds 52 rows: 31 open, 19 done, 2 canceled.
	test("tickets.list returns the project subtree in -updatedAt order", async () => {
		const server = createFakeServer();
		const response = await server.app.request("/api/tickets?project=CDE&limit=200");
		expect(response.status).toBe(200);
		const page = await server.client.tickets.list({ project: "CDE", limit: 200 });
		const items = page.items.map((item) => TicketSummarySchema.parse(item));
		expect(items).toHaveLength(52);
		expect(items.filter((item) => item.completedAt === null)).toHaveLength(31);
		expect(items.filter((item) => item.status.category === "done")).toHaveLength(19);
		expect(items.filter((item) => item.status.category === "canceled")).toHaveLength(2);
		expect(new Set(items.map((item) => item.project.path))).toEqual(new Set(["CDE", "CDE.web", "CDE.host"]));
		expect(items.map((item) => item.identifier)).toEqual(
			[...items].sort(byUpdatedThenId).map((item) => item.identifier),
		);
		expect(page.nextCursor).toBeNull();
		const capped = await server.client.tickets.list({ project: "CDE" });
		expect(capped.items).toHaveLength(50);
		expect(capped.nextCursor).toBeString();
	});

	// WS-113
	test("every list filter of the shared grammar narrows the rows", async () => {
		const server = createFakeServer();
		const list = (input: Parameters<typeof server.client.tickets.list>[0]) =>
			server.client.tickets.list({ limit: 200, ...input }).then((page) => page.items);

		const self = await list({ project: "CDE", subprojects: false });
		expect(self.length).toBeGreaterThan(0);
		expect(self.every((item) => item.project.path === "CDE")).toBe(true);
		expect(self.filter((item) => item.completedAt === null)).toHaveLength(12);

		const status = await list({ project: "CDE", status: ["in-progress", "agent-review"] });
		expect(status.map((item) => item.identifier).sort()).toEqual([
			"CDE-38",
			"CDE-40",
			"CDE-41",
			"CDE-43",
			"CDE-44",
			"CDE-45",
		]);

		const review = await list({ category: ["review"] });
		expect(review.map((item) => item.identifier).sort()).toEqual(["CDE-37", "CDE-40", "CDE-42", "CDE-45", "TRL-9"]);

		const human = await list({ category: ["review"], reviewer: "human" });
		expect(human.map((item) => item.identifier).sort()).toEqual(["CDE-37", "CDE-42", "TRL-9"]);

		const topLevel = await list({ project: "CDE", parent: "none" });
		expect(topLevel.every((item) => item.parent === null)).toBe(true);
		expect(topLevel.map((item) => item.identifier)).not.toContain("CDE-42");
		expect(topLevel.map((item) => item.identifier)).toContain("CDE-43");

		const children = await list({ parent: "cde-43" });
		expect(children.every((item) => item.parent?.identifier === "CDE-43")).toBe(true);
		expect(children.map((item) => item.identifier)).toContain("CDE-42");

		const failing = await list({ ci: ["fail"] });
		expect(failing.map((item) => item.identifier)).toEqual(["CDE-44"]);
		expect(failing[0]!.pr).toEqual({ state: "open", ciState: "fail", pass: 2, fail: 1, pending: 1 });

		const open = await list({ pr: "open" });
		expect(open.map((item) => item.identifier).sort()).toEqual([
			"CDE-37",
			"CDE-40",
			"CDE-42",
			"CDE-43",
			"CDE-44",
			"CDE-45",
		]);
		const none = await list({ project: "CDE", pr: "none" });
		expect(none.every((item) => item.pr === null)).toBe(true);
		expect(none.map((item) => item.identifier)).toContain("CDE-41");

		const urgent = await list({ priority: ["urgent"] });
		expect(urgent.map((item) => item.identifier).sort()).toEqual(["CDE-44", "TRL-12"]);

		const claude = await list({ actor: "agent:claude-code" });
		expect(claude.length).toBeGreaterThan(0);
		expect(claude.every((item) => item.lastActor?.name === "claude-code" && item.lastActor.kind === "agent")).toBe(
			true,
		);
		expect(claude.map((item) => item.identifier)).toContain("CDE-42");
		expect(claude.map((item) => item.identifier)).not.toContain("CDE-43");
		const codex = await list({ actor: "codex" });
		expect(codex.every((item) => item.lastActor?.name === "codex")).toBe(true);
		expect(codex.map((item) => item.identifier)).toContain("CDE-37");
	});

	// WS-114. A cursor is bound to a hash of the filter and the sort.
	test("cursor paging continues without overlap and a cursor is bound to its filter and sort", async () => {
		const server = createFakeServer();
		const first = await server.client.tickets.list({ limit: 5 });
		expect(first.items).toHaveLength(5);
		expect(first.nextCursor).toBeString();
		const second = await server.client.tickets.list({ limit: 5, cursor: first.nextCursor! });
		expect(second.items).toHaveLength(5);
		const all = (await server.client.tickets.list({ limit: 200 })).items.map((item) => item.id);
		expect([...first.items, ...second.items].map((item) => item.id)).toEqual(all.slice(0, 10));
		const { error } = await safe(server.client.tickets.list({ limit: 5, cursor: first.nextCursor!, sort: "priority" }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "INVALID_CURSOR") throw new Error("expected INVALID_CURSOR");
		expect(error.status).toBe(400);
		const other = await safe(server.client.tickets.list({ limit: 5, cursor: first.nextCursor!, project: "TRL" }));
		if (!isDefinedError(other.error) || other.error.code !== "INVALID_CURSOR")
			throw new Error("expected INVALID_CURSOR");
	});

	// WS-115. Three seeded titles carry a token that starts with "oauth":
	// TRL-12 (urgent), CDE-51 (high), MRG-3 (medium).
	test("q matches prefixes and sort=priority orders by the enum", async () => {
		const server = createFakeServer();
		const matches = (await server.client.tickets.list({ q: "oauth" })).items;
		expect(matches.map((item) => item.identifier).sort()).toEqual(["CDE-51", "MRG-3", "TRL-12"]);
		expect(matches.every((item) => /\boauth/i.test(item.title))).toBe(true);
		const byPriority = (await server.client.tickets.list({ q: "oauth", sort: "priority" })).items;
		expect(byPriority.map((item) => item.identifier)).toEqual(["TRL-12", "CDE-51", "MRG-3"]);
		expect((await server.client.tickets.list({ q: "oau" })).items).toHaveLength(3);
		expect((await server.client.tickets.list({ q: "auth" })).items).toHaveLength(0);
	});
});
