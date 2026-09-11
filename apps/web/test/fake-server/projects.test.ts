import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { ProjectSchema, ProjectSummarySchema } from "@trellis/api";
import { createFakeServer } from "./index";
import { openEvents, parseData } from "./sse";

const actorHeaders = { "content-type": "application/json", "x-trellis-actor": "human:navid" };

describe("fake server projects", () => {
	// WS-105. The flat list the sidebar builds its tree from, with the
	// counts the reference screens show.
	test("projects.list returns the seeded tree with its counts", async () => {
		const server = createFakeServer();
		const response = await server.app.request("/api/projects");
		expect(response.status).toBe(200);
		const rows = (await server.client.projects.list({})).map((row) => ProjectSummarySchema.parse(row));
		expect(rows).toHaveLength(5);
		const byPath = Object.fromEntries(rows.map((row) => [row.path, row]));
		expect(byPath.CDE!.name).toBe("Superset CDE");
		expect(byPath.CDE!.openCount).toBe(31);
		expect(byPath.CDE!.depth).toBe(0);
		expect(byPath.CDE!.parentId).toBeNull();
		expect(byPath["CDE.web"]!.openCount).toBe(12);
		expect(byPath["CDE.web"]!.depth).toBe(1);
		expect(byPath["CDE.web"]!.parentId).toBe(byPath.CDE!.id);
		expect(byPath["CDE.web"]!.rootId).toBe(byPath.CDE!.id);
		expect(byPath["CDE.host"]!.openCount).toBe(7);
		expect(byPath.TRL!.name).toBe("trellis");
		expect(byPath.TRL!.openCount).toBe(14);
		expect(byPath.MRG!.name).toBe("margin");
		expect(byPath.MRG!.openCount).toBe(3);
		expect(byPath.CDE!.needsYouCount).toBe(3);
		expect(byPath.TRL!.needsYouCount).toBe(1);
		expect(byPath.MRG!.needsYouCount).toBe(0);
		expect(rows.filter((row) => row.parentId === null).map((row) => row.key)).toEqual(["CDE", "TRL", "MRG"]);
		expect(rows.map((row) => row.path)).toEqual(["CDE", "CDE.web", "CDE.host", "TRL", "MRG"]);
	});

	// WS-106
	test("projects.get resolves refs case-insensitively and inherits statuses", async () => {
		const server = createFakeServer();
		const web = ProjectSchema.parse(await server.client.projects.get({ project: "CDE.web" }));
		const cde = ProjectSchema.parse(await server.client.projects.get({ project: "cde" }));
		expect(cde.path).toBe("CDE");
		expect(web.ancestors.map((ancestor) => ancestor.id)).toEqual([cde.id]);
		expect(web.statusesInheritedFrom).toBe(cde.id);
		expect(cde.statusesInheritedFrom).toBeNull();
		expect(cde.children.map((child) => child.slug)).toEqual(["web", "host"]);
		const statuses = cde.statuses.map((status) => [status.name, status.category, status.reviewer]);
		expect(statuses).toEqual([
			["Todo", "todo", null],
			["In Progress", "started", null],
			["Agent Review", "review", "agent"],
			["Human Review", "review", "human"],
			["Done", "done", null],
			["Canceled", "canceled", null],
		]);
		expect(cde.statuses.map((status) => status.slug)).toEqual([
			"todo",
			"in-progress",
			"agent-review",
			"human-review",
			"done",
			"canceled",
		]);
		expect(cde.statuses.find((status) => status.isDefault)!.slug).toBe("todo");
		expect(web.statuses).toEqual(cde.statuses);
	});

	// WS-107. The OpenAPI handler answers a create with 201 and a Location
	// header, and every response carries the api version.
	test("projects.create answers 201 with Location", async () => {
		const server = createFakeServer();
		const response = await server.app.request("/api/projects", {
			method: "POST",
			headers: actorHeaders,
			body: JSON.stringify({ key: "DOC", name: "Docs" }),
		});
		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toBe("/api/projects/DOC");
		expect(response.headers.get("x-trellis-api-version")).toBeString();
		const project = ProjectSchema.parse(await response.json());
		expect(project.key).toBe("DOC");
		expect(project.path).toBe("DOC");
		expect(project.openCount).toBe(0);
		expect(project.statuses).toHaveLength(6);
		expect(await server.client.projects.list({})).toHaveLength(6);
	});

	// WS-108
	test("projects.create rejects a duplicate key or slug", async () => {
		const server = createFakeServer();
		const key = await safe(server.client.projects.create({ key: "CDE", name: "Again" }));
		expect(isDefinedError(key.error)).toBe(true);
		if (!isDefinedError(key.error) || key.error.code !== "DUPLICATE") throw new Error("expected DUPLICATE");
		expect(key.error.status).toBe(409);
		expect(key.error.data.field).toBe("key");
		const slug = await safe(server.client.projects.create({ parent: "CDE", name: "Web again", slug: "web" }));
		if (!isDefinedError(slug.error) || slug.error.code !== "DUPLICATE") throw new Error("expected DUPLICATE");
		expect(slug.error.status).toBe(409);
		expect(slug.error.data.field).toBe("slug");
	});

	// WS-109
	test("projects.update changes the row and emits project.updated", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app);
		const ready = await stream.nextEvent();
		expect(ready!.event).toBe("ready");
		const updated = await server.client.projects.update({ project: "TRL", name: "Trellis" });
		expect(updated.name).toBe("Trellis");
		expect((await server.client.projects.get({ project: "TRL" })).name).toBe("Trellis");
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("project.updated");
		expect(parseData<object>(frame)).toEqual({ id: updated.id });
		stream.close();
	});

	// WS-110
	test("an unknown project ref is NOT_FOUND with kind and ref", async () => {
		const server = createFakeServer();
		const { error } = await safe(server.client.projects.get({ project: "NOPE" }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "NOT_FOUND") throw new Error("expected NOT_FOUND");
		expect(error.status).toBe(404);
		expect(error.data).toEqual({ kind: "project", ref: "NOPE" });
		const response = await server.app.request("/api/projects/NOPE");
		expect(response.status).toBe(404);
	});
});
