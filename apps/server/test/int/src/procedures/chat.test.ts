import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

// The chat procedures over /api: the channel list, a channel create with
// its Location, a post with its Location, and the message read.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
});
afterAll(() => h.close());
afterEach(() => t.close());

describe("chat", () => {
	test("a new root answers its two default channels", async () => {
		const response = await t.api("/api/projects/CDE/chat");
		expect(response.status).toBe(200);
		expect(response.body.map((channel: { name: string }) => channel.name)).toEqual(["ai", "general"]);
	});

	test("chat.createChannel and chat.post answer 201 with a Location header", async () => {
		const created = await t.api("/api/projects/CDE/chat", { method: "POST", body: { channel: "#release" } });
		expect(created.status).toBe(201);
		expect(created.body.name).toBe("release");
		expect(created.headers.get("location")).toBe(`/api/projects/${created.body.projectId}/chat/release/messages`);

		const posted = await t.api("/api/projects/CDE/chat/release/messages", {
			method: "POST",
			body: { body: "cut 1.2" },
		});
		expect(posted.status).toBe(201);
		expect(posted.body).toMatchObject({ channel: "release", body: "cut 1.2", actor: { name: "dana", kind: "human" } });
		expect(posted.headers.get("location")).toBe(`/api/projects/${posted.body.projectId}/chat/release/messages`);

		const read = await t.api("/api/projects/CDE/chat/release/messages?limit=5");
		expect(read.status).toBe(200);
		expect(read.body.items.map((message: { id: string }) => message.id)).toEqual([posted.body.id]);
		expect(read.body.latestId).toBe(posted.body.id);
	});

	test("a read of an unknown channel answers 404", async () => {
		const response = await t.api("/api/projects/CDE/chat/nowhere/messages");
		expect(response.status).toBe(404);
		expect(response.body.code).toBe("NOT_FOUND");
	});
});
