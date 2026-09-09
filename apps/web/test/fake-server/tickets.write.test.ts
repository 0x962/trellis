import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { TicketSchema } from "@trellis/api";
import { createFakeServer } from "./index";
import { openEvents, parseData } from "./sse";

const actorHeaders = { "content-type": "application/json", "x-trellis-actor": "human:navid" };

type EventData = { summary: { identifier: string; version: number; status: { slug: string } }; fields: string[] };

describe("fake server ticket writes", () => {
	// WS-118. A create takes the project's default status and its ticket
	// template, starts at version 1, and emits ticket.created.
	test("tickets.create answers 201 with Location and the project defaults", async () => {
		const server = createFakeServer();
		const project = await server.client.projects.get({ project: "CDE" });
		expect(project.ticketTemplate.length).toBeGreaterThan(0);
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		const response = await server.app.request("/api/tickets", {
			method: "POST",
			headers: actorHeaders,
			body: JSON.stringify({ project: "CDE", title: "Via curl" }),
		});
		expect(response.status).toBe(201);
		const ticket = TicketSchema.parse(await response.json());
		expect(ticket.number).toBe(project.ticketCounter + 1);
		expect(response.headers.get("location")).toBe(`/api/tickets/${ticket.identifier}`);
		expect(ticket.identifier).toBe(`CDE-${project.ticketCounter + 1}`);
		expect(ticket.status.slug).toBe("todo");
		expect(ticket.description).toBe(project.ticketTemplate);
		expect(ticket.version).toBe(1);
		expect(ticket.lastActor).toMatchObject({ name: "navid", kind: "human" });
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("ticket.created");
		const data = parseData<EventData>(frame);
		expect(data.fields).toEqual([]);
		expect(data.summary.identifier).toBe(ticket.identifier);
		stream.close();
		expect((await server.client.projects.get({ project: "CDE" })).ticketCounter).toBe(project.ticketCounter + 1);
	});

	// WS-119
	test("every write bumps version by one and names its fields", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		const created = await server.client.tickets.create({ project: "TRL", title: "Fresh" });
		expect(created.version).toBe(1);
		await stream.nextEvent();
		await Bun.sleep(2);
		const updated = await server.client.tickets.update({ ticket: created.identifier, title: "New" });
		expect(updated.version).toBe(2);
		expect(updated.title).toBe("New");
		expect(updated.updatedAt > created.updatedAt).toBe(true);
		const updateFrame = await stream.nextEvent();
		expect(updateFrame!.event).toBe("ticket.updated");
		const updateData = parseData<EventData>(updateFrame);
		expect(updateData.fields).toEqual(["title"]);
		expect(updateData.summary.version).toBe(2);
		await Bun.sleep(2);
		const moved = await server.client.tickets.move({ ticket: created.identifier, status: "in-progress" });
		expect(moved.version).toBe(3);
		expect(moved.status.slug).toBe("in-progress");
		expect(moved.updatedAt > updated.updatedAt).toBe(true);
		const moveFrame = await stream.nextEvent();
		expect(moveFrame!.event).toBe("ticket.updated");
		const moveData = parseData<EventData>(moveFrame);
		expect(moveData.fields).toEqual(["status", "position"]);
		expect(moveData.summary.version).toBe(3);
		expect(moveData.summary.status.slug).toBe("in-progress");
		stream.close();
	});

	// WS-120. A stale expectedVersion is a 412 that carries the current row,
	// so the editor can show what changed.
	test("a stale expectedVersion is a 412 with the current row", async () => {
		const server = createFakeServer();
		const created = await server.client.tickets.create({ project: "TRL", title: "Fresh" });
		await server.client.tickets.update({ ticket: created.identifier, title: "Two" });
		const third = await server.client.tickets.update({ ticket: created.identifier, title: "Three" });
		expect(third.version).toBe(3);
		const { error } = await safe(
			server.client.tickets.update({ ticket: created.identifier, description: "x", expectedVersion: 2 }),
		);
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "VERSION_CONFLICT") throw new Error("expected VERSION_CONFLICT");
		expect(error.status).toBe(412);
		expect(error.data.current).toEqual(third);
		const current = await server.client.tickets.get({ ticket: created.identifier });
		expect(current.version).toBe(3);
		expect(current.description).toBe(third.description);
		const response = await server.app.request(`/api/tickets/${created.identifier}`, {
			method: "PATCH",
			headers: { ...actorHeaders, "if-match": '"2"' },
			body: JSON.stringify({ description: "x" }),
		});
		expect(response.status).toBe(412);
	});

	// WS-122. Only a human completes a ticket; an agent needs force.
	test("an agent cannot complete a ticket without force", async () => {
		const server = createFakeServer();
		const agent = server.clientAs("agent:claude-code");
		const { error } = await safe(agent.tickets.move({ ticket: "CDE-42", status: "done" }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "AGENT_CANNOT_COMPLETE")
			throw new Error("expected AGENT_CANNOT_COMPLETE");
		expect(error.status).toBe(403);
		expect(error.data.status.slug).toBe("done");
		expect((await server.client.tickets.get({ ticket: "CDE-42" })).status.slug).toBe("human-review");
		const forced = await agent.tickets.move({ ticket: "CDE-42", status: "done", force: true });
		expect(forced.status.category).toBe("done");
		expect(forced.completedAt).toBeString();
		expect(forced.lastActor).toMatchObject({ name: "claude-code", kind: "agent" });
	});

	// WS-123
	test("tickets.delete answers 200 with the identifier and refuses an agent", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		const agent = server.clientAs("agent:codex");
		const refused = await safe(agent.tickets.delete({ ticket: "CDE-42" }));
		if (!isDefinedError(refused.error) || refused.error.code !== "AGENT_CANNOT_DELETE") {
			throw new Error("expected AGENT_CANNOT_DELETE");
		}
		expect(refused.error.status).toBe(403);
		const response = await server.app.request("/api/tickets/CDE-42", {
			method: "DELETE",
			headers: { "x-trellis-actor": "human:navid" },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ deleted: "CDE-42" });
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("ticket.deleted");
		expect(parseData<EventData>(frame).summary.identifier).toBe("CDE-42");
		stream.close();
		const { error } = await safe(server.client.tickets.get({ ticket: "CDE-42" }));
		if (!isDefinedError(error) || error.code !== "NOT_FOUND") throw new Error("expected NOT_FOUND");
		const parent = await server.client.tickets.get({ ticket: "CDE-43" });
		expect(parent.children.map((child) => child.identifier)).not.toContain("CDE-42");
		const orphan = await server.client.tickets.get({ ticket: "CDE-48" });
		expect(orphan.parent).toBeNull();
	});

	// WS-124
	test("a status outside the project is 409 with the valid list", async () => {
		const server = createFakeServer();
		const { error } = await safe(server.client.tickets.update({ ticket: "CDE-42", status: "nope" }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "STATUS_NOT_IN_PROJECT")
			throw new Error("expected STATUS_NOT_IN_PROJECT");
		expect(error.status).toBe(409);
		expect(error.data.valid.map((status) => status.slug)).toEqual([
			"todo",
			"in-progress",
			"agent-review",
			"human-review",
			"done",
			"canceled",
		]);
		const missing = await safe(server.client.tickets.create({ project: "NOPE", title: "x" }));
		if (!isDefinedError(missing.error) || missing.error.code !== "NOT_FOUND") throw new Error("expected NOT_FOUND");
		expect(missing.error.status).toBe(404);
		expect(missing.error.data).toEqual({ kind: "project", ref: "NOPE" });
	});
});
