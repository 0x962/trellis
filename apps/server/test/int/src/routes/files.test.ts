import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ulid } from "ulid";
import { blobPath } from "../../../../src/storage/blobs.ts";
import { seedAttachment } from "../../../fixtures";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { sha256Of } from "../../../helpers/home.ts";

// GET /api/attachments/{id}/file serves the stored bytes with the recorded
// mime, an ETag of the hash, an immutable private cache, nosniff, and a
// sandbox CSP. Only the ten allowlisted types render inline; everything
// else downloads. No Range support in v1.

let h: TestDb;
let t: TestApp;
let ticketId: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
	ticketId = (await t.createTicket({ project: "CDE", title: "Holder" })).id;
});
afterAll(() => h.close());

const INLINE = [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"video/mp4",
	"video/webm",
];

// One attachment row with its blob on disk.
const stored = async (mime: string, filename: string, bytes = new TextEncoder().encode(`bytes of ${filename}`)) => {
	const sha256 = sha256Of(bytes);
	mkdirSync(dirname(blobPath(t.home, sha256)), { recursive: true });
	await Bun.write(blobPath(t.home, sha256), bytes);
	const id = await seedAttachment(h.db, ticketId, { mime, filename, size: bytes.length, sha256 });
	return { id, sha256, bytes };
};

const fetchFile = (id: string, headers: Record<string, string> = {}) =>
	t.app.request(`http://trellis.test/api/attachments/${id}/file`, { headers });

describe("files route", () => {
	test("a PNG renders inline with the cache and safety headers", async () => {
		const { id, sha256 } = await stored("image/png", "shot.png");

		const response = await fetchFile(id);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("content-disposition")).toMatch(/^inline/);
		expect(response.headers.get("etag")).toBe(`"${sha256}"`);
		expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-security-policy")).toBe("sandbox");
	});

	test("a matching If-None-Match answers 304", async () => {
		const { id, sha256 } = await stored("image/png", "shot.png");

		const response = await fetchFile(id, { "if-none-match": `"${sha256}"` });

		expect(response.status).toBe(304);
		expect(await response.text()).toBe("");
	});

	test("an SVG downloads instead of rendering", async () => {
		const { id } = await stored("image/svg+xml", "logo.svg");

		const response = await fetchFile(id);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
		expect(response.headers.get("content-disposition")).toContain("logo.svg");
	});

	test("HTML downloads instead of rendering", async () => {
		const { id } = await stored("text/html", "page.html");

		const response = await fetchFile(id);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
	});

	test("the inline allowlist holds exactly the ten documented types", async () => {
		const outside = ["image/svg+xml", "text/html", "application/octet-stream", "application/javascript"];
		const seen: Record<string, string> = {};
		for (const mime of [...INLINE, ...outside]) {
			const { id } = await stored(mime, `file-${mime.replace(/\W/g, "-")}`);
			const response = await fetchFile(id);
			seen[mime] = (response.headers.get("content-disposition") ?? "").split(";")[0]!;
		}

		for (const mime of INLINE) expect(seen[mime], mime).toBe("inline");
		for (const mime of outside) expect(seen[mime], mime).toBe("attachment");
	});

	test("the file route serves the stored bytes", async () => {
		const bytes = new Uint8Array(4096).map((_, i) => i % 251);
		const { id } = await stored("application/pdf", "doc.pdf", bytes);

		const response = await fetchFile(id);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-length")).toBe(String(bytes.length));
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
	});

	test("a filename outside Latin-1 serves with an ASCII fallback and a UTF-8 filename*", async () => {
		const names = ["Screenshot 2026-09-10 at 10.47.57\u202fAM.png", "résumé 日本.txt"];
		for (const name of names) {
			const { id } = await stored(name.endsWith(".png") ? "image/png" : "text/plain", name);

			const response = await fetchFile(id);

			expect(response.status, name).toBe(200);
			const header = response.headers.get("content-disposition")!;
			expect(header).toMatch(/^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''\S+$/);
			expect(decodeURIComponent(header.split("filename*=UTF-8''")[1]!)).toBe(name);
		}
	});

	test("a filename with a double quote or a backslash serves a well-formed header", async () => {
		const name = 'say "hi" \\ bye.txt';
		const { id } = await stored("text/plain", name);

		const response = await fetchFile(id);

		expect(response.status).toBe(200);
		const header = response.headers.get("content-disposition")!;
		const fallback = header.match(/filename="([^"]*)"/)![1]!;
		expect(fallback).not.toMatch(/["\\]/);
		expect(decodeURIComponent(header.split("filename*=UTF-8''")[1]!)).toBe(name);
	});

	test("an unknown attachment id answers 404", async () => {
		const response = await fetchFile(ulid());

		expect(response.status).toBe(404);
	});

	test("the file route ignores a Range header", async () => {
		const { id, bytes } = await stored("text/plain", "notes.txt");

		const response = await fetchFile(id, { range: "bytes=0-10" });

		expect(response.status).toBe(200);
		expect(response.headers.get("accept-ranges")).toBeNull();
		expect(response.headers.get("content-range")).toBeNull();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
	});
});
