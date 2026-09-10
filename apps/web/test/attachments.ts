import { fireEvent, waitFor } from "@testing-library/react";
import type { Attachment } from "@trellis/api";
import { ulid } from "ulid";
import type { FakeServer } from "./fake-server";
import { findTicket } from "./fake-server/state";

// Helpers for the attachments tests: files of an exact size, drag and drop
// events, rows written straight into the fake server, and a server that
// records every request the page makes.

// A file of exactly `size` bytes. The content is one repeated character, so
// two files of one size hold the same bytes and the same hash.
export const fileOf = (name: string, mime: string, size: number, fill = "a") =>
	new File([fill.repeat(size)], name, { type: mime });

// A drag that carries files, the way a browser reports one over a surface.
export const dragFilesOver = (element: Element) =>
	fireEvent.dragOver(element, { dataTransfer: { types: ["Files"], files: [] } });

// A drag that carries selected text and no file.
export const dragTextOver = (element: Element) =>
	fireEvent.dragOver(element, { dataTransfer: { types: ["text/plain"], files: [] } });

export const dragLeave = (element: Element) =>
	fireEvent.dragLeave(element, { dataTransfer: { types: ["Files"], files: [] } });

// Drops `files` on `element`. The result is false when the handler called
// preventDefault, which is what stops the browser from opening the file.
export const dropFiles = (element: Element, files: File[]) =>
	fireEvent.drop(element, { dataTransfer: { types: ["Files"], files } });

// A paste of one file, the way a browser reports a copied image.
export const pasteFiles = (element: Element, files: File[]) =>
	fireEvent.paste(element, { clipboardData: { types: ["Files"], files, items: [] } });

// A paste of plain text.
export const pasteText = (element: Element, text: string) =>
	fireEvent.paste(element, { clipboardData: { types: ["text/plain"], files: [], getData: () => text } });

// A sha256 built from an id, so a seeded row carries a hash of the right
// shape without any bytes behind it.
const fakeSha = (id: string) =>
	id
		.toLowerCase()
		.replace(/[^0-9a-f]/g, "0")
		.padEnd(64, "0");

// One attachment row, with the fields a test does not care about filled in.
export const attachmentOf = (overrides: Partial<Attachment> = {}): Attachment => {
	const id = ulid();
	return {
		id,
		ticketId: ulid(),
		filename: "notes.md",
		mime: "text/markdown",
		size: 2048,
		sha256: fakeSha(id),
		actor: { name: "navid", kind: "human" },
		createdAt: new Date().toISOString(),
		url: `/api/attachments/${id}/file`,
		...overrides,
	};
};

// Writes one attachment row into the fake server, the way the seed does.
// The grid reads it back through attachments.list.
export const addAttachment = (
	server: FakeServer,
	ticket: string,
	filename: string,
	mime: string,
	size = 1024,
): Attachment => {
	const id = ulid();
	const attachment: Attachment = {
		id,
		ticketId: findTicket(server.state, ticket)!.id,
		filename,
		mime,
		size,
		sha256: fakeSha(id),
		actor: { name: "navid", kind: "human" },
		createdAt: new Date().toISOString(),
		url: `/api/attachments/${id}/file`,
	};
	server.state.attachments.set(id, attachment);
	return attachment;
};

// One request the page or its client sent.
export type RequestLog = { method: string; path: string; contentType: string | null };

const logOf = (request: Request): RequestLog => ({
	method: request.method,
	path: new URL(request.url).pathname,
	contentType: request.headers.get("content-type"),
});

const originalFetch = globalThis.fetch;

// A fake server that records every request. The page reads attachment bytes
// with a plain GET, so `globalThis.fetch` goes to the same app as the oRPC
// client does.
export const recordingServer = (server: FakeServer) => {
	const requests: RequestLog[] = [];
	const fetch: FakeServer["fetch"] = (request, init) => {
		requests.push(logOf(request));
		return server.fetch(request, init);
	};
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		requests.push(logOf(request));
		return server.app.request(request);
	}) as typeof globalThis.fetch;
	return { server: { ...server, fetch }, requests };
};

// Puts `globalThis.fetch` back. Every file that builds a recording server
// calls this after each test.
export const restoreFetch = () => {
	globalThis.fetch = originalFetch;
};

// The attachments section, once the list query has painted it.
export const surfaceOf = async () =>
	await waitFor(() => {
		const surface = document.querySelector<HTMLElement>("[data-attachments]");
		if (surface === null) throw new Error("No attachments surface on the page.");
		return surface;
	});

// The file rows of the section, in the order they are on the page.
export const rowsOf = () => [...document.querySelectorAll<HTMLElement>("[data-attachment-row]")];

// The image thumbnails of the section, in the order they are on the page.
export const thumbnailsOf = () => [...document.querySelectorAll<HTMLElement>("[data-thumbnail]")];
