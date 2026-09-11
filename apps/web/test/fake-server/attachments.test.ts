import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { AttachmentUploadOutputSchema } from "@trellis/api";
import { fileOf } from "../attachments";
import { createFakeServer, type FakeServer } from "./index";
import { openEvents, parseData } from "./sse";

// The multipart route the OpenAPI handler serves. A raw request shows the
// status the contract declares; the typed client hides it.
const upload = (server: FakeServer, ticket: string, file: File, name?: string) => {
	const body = new FormData();
	body.set("file", file);
	if (name !== undefined) body.set("name", name);
	return server.app.request(`/api/tickets/${ticket}/attachments`, {
		method: "POST",
		headers: { "x-trellis-actor": "human:navid" },
		body,
	});
};

const uploaded = async (server: FakeServer, ticket: string, file: File, name?: string) => {
	const response = await upload(server, ticket, file, name);
	return AttachmentUploadOutputSchema.parse(await response.json());
};

// Only the attachment events, so the count of frames is the count of them.
const attachmentEvents = (server: FakeServer) => openEvents(server.app, "/api/events?types=attachment.*");

describe("fake attachments", () => {
	// OUT-01
	test("upload stores the file and returns the attachment, the url, and the markdown", async () => {
		const server = createFakeServer();
		const response = await upload(server, "CDE-42", fileOf("notes.txt", "text/plain", 12));
		expect(response.status).toBe(201);
		const result = AttachmentUploadOutputSchema.parse(await response.json());
		const { attachment } = result;
		expect(attachment.filename).toBe("notes.txt");
		expect(attachment.mime).toBe("text/plain");
		expect(attachment.size).toBe(12);
		expect(attachment.url).toBe(`/api/attachments/${attachment.id}/file`);
		expect(attachment.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(attachment.actor).toEqual({ name: "navid", kind: "human" });
		expect(result.url).toBe(attachment.url);
		expect(result.markdown).toBe(`[notes.txt](${attachment.url})`);
	});

	// OUT-02. An agent uploads a screenshot under a name that says what it is.
	test("upload uses the name input in place of the file name", async () => {
		const server = createFakeServer();
		const result = await uploaded(server, "CDE-42", fileOf("notes.txt", "text/plain", 12), "renamed.txt");
		expect(result.attachment.filename).toBe("renamed.txt");
		const list = await server.client.attachments.list({ ticket: "CDE-42" });
		expect(list.map((row) => row.filename)).not.toContain("notes.txt");
	});

	// OUT-03
	test("upload emits attachment.created for the ticket", async () => {
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		const stream = await attachmentEvents(server);
		await stream.nextEvent();
		const result = await uploaded(server, "CDE-42", fileOf("notes.txt", "text/plain", 12));
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("attachment.created");
		// TRL-9. The frame carries the content, the way the real server sends it.
		expect(parseData<object>(frame)).toEqual({
			id: result.attachment.id,
			ticketId: ticket.id,
			ticketIdentifier: "CDE-42",
			ticketTitle: ticket.title,
			actor: { name: "navid", kind: "human" },
			filename: "notes.txt",
		});
		stream.close();
	});

	// OUT-04. The cap is the server's, so the browser learns the limit from
	// the error and never from a copy of its own.
	test("upload over the cap fails with PAYLOAD_TOO_LARGE and the limit", async () => {
		const server = createFakeServer({ maxUploadBytes: 1024 });
		const before = server.state.attachments.size;
		const { error } = await safe(
			server.client.attachments.upload({ ticket: "CDE-42", file: fileOf("big.bin", "application/octet-stream", 2048) }),
		);
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "PAYLOAD_TOO_LARGE") throw new Error("expected PAYLOAD_TOO_LARGE");
		expect(error.status).toBe(413);
		expect(error.data).toEqual({ maxBytes: 1024 });
		expect(server.state.attachments.size).toBe(before);
	});

	// OUT-05
	test("list returns the attachments of one ticket in upload order", async () => {
		const server = createFakeServer();
		const list = await server.client.attachments.list({ ticket: "CDE-47" });
		expect(list.map((row) => row.filename)).toEqual(["rename-flow.png", "notes.md"]);
		const other = await server.client.attachments.list({ ticket: "CDE-42" });
		expect(list.map((row) => row.id)).not.toContain(other[0]!.id);
	});

	// OUT-06
	test("delete removes the row and emits attachment.deleted", async () => {
		const server = createFakeServer();
		const result = await uploaded(server, "CDE-42", fileOf("notes.txt", "text/plain", 12));
		const stream = await attachmentEvents(server);
		await stream.nextEvent();
		const deleted = await server.client.attachments.delete({ id: result.attachment.id });
		expect(deleted).toEqual({ deleted: result.attachment.id });
		const list = await server.client.attachments.list({ ticket: "CDE-42" });
		expect(list.map((row) => row.id)).not.toContain(result.attachment.id);
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("attachment.deleted");
		expect(parseData<{ id: string }>(frame).id).toBe(result.attachment.id);
		stream.close();
	});

	// OUT-07. The table and the card read the count, the ticket page reads
	// the rows, so one upload must move both.
	test("upload raises the attachmentCount that tickets.get reports", async () => {
		const server = createFakeServer();
		const before = await server.client.tickets.get({ ticket: "CDE-42" });
		expect(before.attachmentCount).toBe(1);
		const result = await uploaded(server, "CDE-42", fileOf("notes.txt", "text/plain", 12));
		const after = await server.client.tickets.get({ ticket: "CDE-42" });
		expect(after.attachmentCount).toBe(2);
		expect(after.attachments.map((row) => row.id)).toContain(result.attachment.id);
		expect(after.attachments).toHaveLength(2);
	});
});
