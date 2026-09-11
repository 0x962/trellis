import { describe, expect, test } from "bun:test";
import { CommentSchema } from "@trellis/api";
import { createFakeServer } from "./index";
import { openEvents, parseData } from "./sse";

const actorHeaders = { "content-type": "application/json", "x-trellis-actor": "human:navid" };

describe("fake server comments", () => {
	test("threads group replies and retain their resolution state", async () => {
		const server = createFakeServer();
		const root = await server.client.comments.create({ ticket: "CDE-42", body: "A question" });
		const reply = await server.client.comments.create({ ticket: "CDE-42", parentId: root.id, body: "An answer" });
		server.state.comments.get(reply.id)!.createdAt = new Date(Date.now() - 1000).toISOString();
		const second = await server.client.comments.create({ ticket: "CDE-42", parentId: reply.id, body: "A follow-up" });
		expect(second.parentId).toBe(root.id);
		expect((await server.client.comments.thread({ id: reply.id })).replies.map((item) => item.id)).toEqual([
			reply.id,
			second.id,
		]);
		expect((await server.client.comments.resolve({ id: reply.id, resolved: true })).resolvedAt).toBeString();
		expect((await server.client.comments.resolve({ id: root.id, resolved: false })).resolvedAt).toBeNull();
	});

	// WS-125. A comment is user-visible activity, so the ticket's version
	// and updatedAt move with it.
	test("comment writes keep the count and emit their events", async () => {
		const server = createFakeServer();
		const before = await server.client.tickets.get({ ticket: "CDE-42" });
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		// The server may emit a ticket.updated for the count beside each
		// comment event, so the reader skips to the event under test.
		const frameOf = async (type: string) => {
			for (;;) {
				const frame = await stream.nextEvent();
				if (frame === null || frame.event === type) return frame;
			}
		};
		const response = await server.app.request("/api/tickets/CDE-42/comments", {
			method: "POST",
			headers: actorHeaders,
			body: JSON.stringify({ body: "ok" }),
		});
		expect(response.status).toBe(201);
		const comment = CommentSchema.parse(await response.json());
		expect(response.headers.get("location")).toBe(`/api/comments/${comment.id}`);
		expect(comment.ticketId).toBe(before.id);
		expect(comment.body).toBe("ok");
		expect(comment.actor).toEqual({ name: "navid", kind: "human" });
		const created = await frameOf("comment.created");
		expect(created!.event).toBe("comment.created");
		// TRL-9. The frame carries the content, the way the real server sends it.
		expect(parseData<object>(created)).toEqual({
			id: comment.id,
			ticketId: before.id,
			ticketIdentifier: "CDE-42",
			ticketTitle: before.title,
			actor: { name: "navid", kind: "human" },
			body: "ok",
			bodyTruncated: false,
		});
		const after = await server.client.tickets.get({ ticket: "CDE-42" });
		expect(after.commentCount).toBe(before.commentCount + 1);
		expect(after.version).toBe(before.version + 1);

		const updated = await server.client.comments.update({ id: comment.id, body: "edited" });
		expect(updated.body).toBe("edited");
		expect(updated.updatedAt >= comment.updatedAt).toBe(true);
		const updatedFrame = await frameOf("comment.updated");
		expect(updatedFrame!.event).toBe("comment.updated");
		expect(parseData<object>(updatedFrame)).toEqual({
			id: comment.id,
			ticketId: before.id,
			ticketIdentifier: "CDE-42",
			ticketTitle: before.title,
			actor: { name: "navid", kind: "human" },
			body: "edited",
			bodyTruncated: false,
		});

		const deleteResponse = await server.app.request(`/api/comments/${comment.id}`, {
			method: "DELETE",
			headers: { "x-trellis-actor": "human:navid" },
		});
		expect(deleteResponse.status).toBe(200);
		expect(await deleteResponse.json()).toEqual({ deleted: comment.id });
		const deletedFrame = await frameOf("comment.deleted");
		expect(deletedFrame!.event).toBe("comment.deleted");
		expect(parseData<object>(deletedFrame)).toEqual({
			id: comment.id,
			ticketId: before.id,
			ticketIdentifier: "CDE-42",
			ticketTitle: before.title,
			actor: { name: "navid", kind: "human" },
			body: "edited",
			bodyTruncated: false,
		});
		stream.close();
		expect((await server.client.tickets.get({ ticket: "CDE-42" })).commentCount).toBe(before.commentCount);
	});
});
