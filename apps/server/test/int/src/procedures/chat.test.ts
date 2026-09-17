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
		expect(response.body.map((channel: { name: string }) => channel.name)).toEqual(["ai", "general", "manager"]);
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

	test("a person is refused in #ai, and an agent is not", async () => {
		const refused = await t.api("/api/projects/CDE/chat/ai/messages", { method: "POST", body: { body: "hi" } });
		expect(refused.status).toBe(403);
		expect(refused.body.code).toBe("CHAT_AI_ONLY");
		const allowed = await t.api("/api/projects/CDE/chat/ai/messages", {
			method: "POST",
			body: { body: "hi" },
			actor: "agent:01J8Z6X4Q3M2K1H0G9F8E7D6G1",
		});
		expect(allowed.status).toBe(201);
	});

	test("a chat upload stores the file and serves it at its own route", async () => {
		const form = new FormData();
		form.set("file", new File([new TextEncoder().encode("plain notes")], "notes.txt", { type: "text/plain" }));
		const response = await t.api("/api/projects/CDE/chat/attachments", { method: "POST", raw: form });
		expect(response.status).toBe(201);
		expect(response.body.attachment).toMatchObject({ filename: "notes.txt", mime: "text/plain", size: 11 });
		expect(response.body.markdown).toBe(`[notes.txt](${response.body.url})`);
		expect(response.headers.get("location")).toBe(`/api/chat/attachments/${response.body.attachment.id}`);
		const file = await t.app.request(`http://trellis.test${response.body.url}`);
		expect(file.status).toBe(200);
		expect(await file.text()).toBe("plain notes");
		const meta = await t.api(`/api/chat/attachments/${response.body.attachment.id}`);
		expect(meta.status).toBe(200);
		expect(meta.body.sha256).toBe(response.body.attachment.sha256);
	});

	test("a read of an unknown channel answers 404", async () => {
		const response = await t.api("/api/projects/CDE/chat/nowhere/messages");
		expect(response.status).toBe(404);
		expect(response.body.code).toBe("NOT_FOUND");
	});
});
