import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	dropFiles,
	fileOf,
	recordingServer,
	restoreFetch,
	rowsOf,
	surfaceOf,
	thumbnailsOf,
} from "../../../../test/attachments";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { callsTo } from "../../../../test/inbox";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AttachmentGrid } from "./AttachmentGrid";

beforeEach(() => localStorage.clear());
afterEach(restoreFetch);

const oneMegabyte = 1024 * 1024;

const renderGrid = (server: FakeServer, ticket = "CDE-42") =>
	renderWithProviders(<AttachmentGrid ticket={ticket} />, { path: `/t/${ticket}`, actor: "navid", server });

const rowNamed = (name: string) => rowsOf().find((row) => row.textContent?.includes(name));

describe("AttachmentGrid", () => {
	// OUT-18. The bytes go out as multipart, so a large file never becomes
	// a base64 string in a JSON body.
	test("a dropped file posts multipart to attachments.upload and appears with its size", async () => {
		const recorder = recordingServer(createFakeServer());
		renderGrid(recorder.server);
		const surface = await surfaceOf();
		dropFiles(surface, [fileOf("notes.txt", "text/plain", 2048)]);
		await screen.findByText("notes.txt");
		expect(screen.getByText("2.0 KB")).toBeDefined();
		const uploads = recorder.requests.filter((request) => request.path === "/rpc/attachments/upload");
		expect(uploads).toHaveLength(1);
		expect(uploads[0]!.contentType).toStartWith("multipart/form-data");
	});

	// OUT-19
	test("uploads every file of one drop", async () => {
		const server = createFakeServer();
		renderGrid(server);
		const surface = await surfaceOf();
		dropFiles(surface, [fileOf("notes.txt", "text/plain", 2048), fileOf("plan.md", "text/markdown", 1024)]);
		await screen.findByText("notes.txt");
		await screen.findByText("plan.md");
		expect(callsTo(server, "attachments.upload")).toHaveLength(2);
	});

	// OUT-20. A ticket carries the work of several actors, so a row states
	// who added the file and when.
	test("shows the uploading actor and the time on the new row", async () => {
		const server = createFakeServer();
		renderGrid(server);
		const surface = await surfaceOf();
		dropFiles(surface, [fileOf("notes.txt", "text/plain", 2048)]);
		await screen.findByText("notes.txt");
		const row = rowNamed("notes.txt")!;
		expect(within(row).getByText("navid")).toBeDefined();
		expect(within(row).getByText("just now")).toBeDefined();
	});

	// OUT-28. The limit is the server's, so the message states the number
	// the server sent and never a copy in the page.
	test("a file over the cap shows PAYLOAD_TOO_LARGE inline with the limit in megabytes", async () => {
		const server = createFakeServer({ maxUploadBytes: oneMegabyte });
		renderGrid(server);
		const surface = await surfaceOf();
		const before = rowsOf().length;
		dropFiles(surface, [fileOf("big.bin", "application/octet-stream", 2 * oneMegabyte)]);
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("big.bin");
		expect(alert.textContent).toContain("1 MB");
		expect(rowsOf()).toHaveLength(before);
	});

	// OUT-29
	test("keeps uploading the other files of a drop that holds one oversized file", async () => {
		const server = createFakeServer({ maxUploadBytes: oneMegabyte });
		renderGrid(server);
		const surface = await surfaceOf();
		dropFiles(surface, [
			fileOf("big.bin", "application/octet-stream", 2 * oneMegabyte),
			fileOf("notes.txt", "text/plain", 100),
		]);
		await screen.findByText("notes.txt");
		expect(rowNamed("notes.txt")).toBeDefined();
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("big.bin");
	});

	// OUT-30
	test("Dismiss removes the inline upload error", async () => {
		const user = userEvent.setup();
		const server = createFakeServer({ maxUploadBytes: oneMegabyte });
		renderGrid(server);
		const surface = await surfaceOf();
		dropFiles(surface, [
			fileOf("big.bin", "application/octet-stream", 2 * oneMegabyte),
			fileOf("notes.txt", "text/plain", 100),
		]);
		await screen.findByText("notes.txt");
		await screen.findByRole("alert");
		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
		expect(rowNamed("notes.txt")).toBeDefined();
	});

	// OUT-31. An image reads faster as a picture than as a file name.
	test("renders images as 96 px thumbnails and other files as rows", async () => {
		const server = createFakeServer();
		renderGrid(server, "CDE-47");
		await surfaceOf();
		const thumbnail = await screen.findByRole("button", { name: /rename-flow\.png/ });
		expect(thumbnail.getAttribute("class")).toMatch(/(^|\s)(size-24|h-24)(\s|$)/);
		expect(thumbnailsOf().length).toBe(1);
		expect(rowNamed("notes.md")).toBeDefined();
		expect(rowNamed("rename-flow.png")).toBeUndefined();
	});

	// OUT-36
	test("shows the drop box alone when the ticket has no attachment", async () => {
		const server = createFakeServer();
		renderGrid(server, "CDE-51");
		const surface = await surfaceOf();
		expect(rowsOf()).toHaveLength(0);
		expect(thumbnailsOf()).toHaveLength(0);
		expect(surface.querySelector("[data-attachment-box]")).not.toBeNull();
	});

	// TK-6. An empty section is its header row, with Upload on the right.
	test("a ticket with no attachment shows the header and an Upload button", async () => {
		const server = createFakeServer();
		renderGrid(server, "CDE-51");
		const surface = await surfaceOf();
		const upload = within(surface).getByRole("button", { name: "Upload" });
		expect(upload.hasAttribute("data-attachment-box")).toBe(true);
		expect(within(surface).getByRole("heading", { name: "Attachments" })).toBeDefined();
		expect(surface.textContent).not.toContain("·");
		expect(surface.textContent).not.toContain("Drop files or click to upload");
	});

	// TK-6. The thumbnails end in a 96 px dashed tile that adds a file.
	test("the thumbnail grid ends in an add tile", async () => {
		const server = createFakeServer();
		renderGrid(server, "CDE-47");
		await surfaceOf();
		await screen.findByRole("button", { name: /rename-flow\.png/ });
		const tile = document.querySelector<HTMLElement>("[data-attachment-box]")!;
		expect(tile.parentElement!.lastElementChild).toBe(tile);
		expect(tile.parentElement!.querySelector("[data-thumbnail]")).not.toBeNull();
		expect(tile.getAttribute("class")).toMatch(/(^|\s)size-24(\s|$)/);
		expect(tile.getAttribute("class")).toContain("border-dashed");
	});
});
