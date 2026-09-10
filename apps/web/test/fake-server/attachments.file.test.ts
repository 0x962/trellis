import { describe, expect, test } from "bun:test";
import { AttachmentUploadOutputSchema } from "@trellis/api";
import { fileOf } from "../attachments";
import { createFakeServer, type FakeServer } from "./index";

const uploaded = async (server: FakeServer, ticket: string, file: File) => {
	const body = new FormData();
	body.set("file", file);
	const response = await server.app.request(`/api/tickets/${ticket}/attachments`, {
		method: "POST",
		headers: { "x-trellis-actor": "human:navid" },
		body,
	});
	return AttachmentUploadOutputSchema.parse(await response.json()).attachment;
};

const readFile = (server: FakeServer, id: string) => server.app.request(`/api/attachments/${id}/file`);

const png = () => fileOf("shot.png", "image/png", 64);
const svg = () => fileOf("logo.svg", "image/svg+xml", 64);

describe("fake attachment file route", () => {
	test("serves valid bytes for a seeded PNG", async () => {
		const server = createFakeServer();
		const attachment = [...server.state.attachments.values()].find(
			(candidate) => candidate.filename === "rename-flow.png",
		)!;
		const response = await readFile(server, attachment.id);
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(bytes.byteLength).toBe(attachment.size);
	});

	// OUT-08
	test("serves an allowlisted PNG inline with its bytes", async () => {
		const server = createFakeServer();
		const file = png();
		const attachment = await uploaded(server, "CDE-42", file);
		const response = await readFile(server, attachment.id);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("content-disposition")).toBe('inline; filename="shot.png"');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
	});

	// OUT-09. A browser runs the script inside an SVG, so an SVG served
	// inline on the app origin is stored XSS.
	test("serves an SVG as an attachment download", async () => {
		const server = createFakeServer();
		const attachment = await uploaded(server, "CDE-42", svg());
		const response = await readFile(server, attachment.id);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toBe('attachment; filename="logo.svg"');
	});

	// OUT-10
	test("sets the sandbox, nosniff, cache, and ETag headers on every response", async () => {
		const server = createFakeServer();
		const image = await uploaded(server, "CDE-42", png());
		const drawing = await uploaded(server, "CDE-42", svg());
		for (const attachment of [image, drawing]) {
			const response = await readFile(server, attachment.id);
			expect(response.headers.get("content-security-policy")).toBe("sandbox");
			expect(response.headers.get("x-content-type-options")).toBe("nosniff");
			expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
			expect(response.headers.get("etag")).toBe(`"${attachment.sha256}"`);
		}
	});

	// OUT-11
	test("answers 404 for an unknown id", async () => {
		const server = createFakeServer();
		const response = await readFile(server, "01J8Z6X4Q3M2K1H0G9F8E7D6Z9");
		expect(response.status).toBe(404);
		expect((await response.arrayBuffer()).byteLength).toBe(0);
	});

	// OUT-12. The blob on disk is addressed by its hash, so two uploads of
	// one file share the bytes and a cache holds one copy.
	test("gives the same ETag to two uploads of the same bytes", async () => {
		const server = createFakeServer();
		const first = await uploaded(server, "CDE-42", fileOf("first.png", "image/png", 64));
		const second = await uploaded(server, "CDE-42", fileOf("second.png", "image/png", 64));
		expect(first.id).not.toBe(second.id);
		const firstResponse = await readFile(server, first.id);
		const secondResponse = await readFile(server, second.id);
		expect(firstResponse.headers.get("etag")).toBe(secondResponse.headers.get("etag"));
	});
});
