import { describe, expect, test } from "bun:test";
import { contentDisposition, isInlineMime } from "../../../../src/services/attachments.ts";

// The files route serves a blob inline only for the ten types on the
// allowlist. An SVG or an HTML file on the app origin runs as script, so
// every type outside the list downloads.

const allowed = [
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

describe("isInlineMime", () => {
	test("the ten allowed mime types serve inline", () => {
		expect(allowed).toHaveLength(10);
		for (const mime of allowed) expect(isInlineMime(mime)).toBe(true);
	});

	test("svg and html never serve inline", () => {
		expect(isInlineMime("image/svg+xml")).toBe(false);
		expect(isInlineMime("text/html")).toBe(false);
		expect(isInlineMime("application/octet-stream")).toBe(false);
		expect(isInlineMime("text/plain; charset=utf-8")).toBe(true);
	});
});

describe("contentDisposition", () => {
	test("the disposition is inline for the allowlist and attachment for the rest", () => {
		expect(contentDisposition("shot.png", "image/png")).toBe('inline; filename="shot.png"');
		expect(contentDisposition("notes.txt", "text/plain; charset=utf-8")).toBe('inline; filename="notes.txt"');
		expect(contentDisposition("logo.svg", "image/svg+xml")).toBe('attachment; filename="logo.svg"');
		expect(contentDisposition("page.html", "text/html")).toBe('attachment; filename="page.html"');
		expect(contentDisposition("data.bin", "application/octet-stream")).toBe('attachment; filename="data.bin"');
	});
});
