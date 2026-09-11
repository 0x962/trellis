import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recordingServer, restoreFetch, rowsOf, surfaceOf } from "../../../../test/attachments";
import { callsTo, mockClipboard } from "../../../../test/inbox";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../test/server";
import { AttachmentGrid } from "./AttachmentGrid";

beforeEach(() => localStorage.clear());
afterEach(restoreFetch);

// CDE-47 carries rename-flow.png and notes.md in the seed.
const ticket = "CDE-47";

const renderGrid = (server: TestServer) =>
	renderWithProviders(<AttachmentGrid ticket={ticket} />, { path: `/t/${ticket}`, actor: "navid", server });

const triggerFor = (filename: string) => screen.getByRole("button", { name: `Actions for ${filename}` });

const openMenu = async (user: ReturnType<typeof userEvent.setup>, filename: string) => {
	const trigger = triggerFor(filename);
	await user.click(trigger);
	await screen.findByRole("menu");
	return trigger;
};

const attachmentNamed = async (server: TestServer, filename: string) => {
	const list = await server.client.attachments.list({ ticket });
	return list.find((row) => row.filename === filename)!;
};

const rowNamed = (filename: string) => rowsOf().find((row) => row.textContent?.includes(filename));

describe("row menu", () => {
	// OUT-43
	test("holds Copy markdown link, Rename, and Delete", async () => {
		const user = userEvent.setup();
		renderGrid(createTestServer());
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		await openMenu(user, "notes.md");
		expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
			"Copy markdown link",
			"Rename",
			"Delete",
		]);
	});

	// OUT-44. An agent pastes the line into a comment, so the url is the
	// contract's own and never a path the page builds.
	test("Copy markdown link writes the markdown of the file url", async () => {
		const user = userEvent.setup();
		const clipboard = mockClipboard();
		const server = createTestServer();
		renderGrid(server);
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		const notes = await attachmentNamed(server, "notes.md");
		await openMenu(user, "notes.md");
		await user.click(screen.getByRole("menuitem", { name: "Copy markdown link" }));
		await waitFor(() => expect(clipboard.written).toEqual([`[notes.md](${notes.url})`]));
	});

	// OUT-46
	test("Rename opens an inline field seeded with the current name", async () => {
		const user = userEvent.setup();
		renderGrid(createTestServer());
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		await openMenu(user, "notes.md");
		await user.click(screen.getByRole("menuitem", { name: "Rename" }));
		const field = await screen.findByRole("textbox");
		expect((field as HTMLInputElement).value).toBe("notes.md");
		await waitFor(() => expect(document.activeElement).toBe(field));
		expect((field as HTMLInputElement).selectionStart).toBe(0);
		expect((field as HTMLInputElement).selectionEnd).toBe("notes.md".length);
	});

	// OUT-47
	test("Escape cancels the rename and returns focus to the trigger", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		renderGrid(server);
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		const trigger = await openMenu(user, "notes.md");
		await user.click(screen.getByRole("menuitem", { name: "Rename" }));
		await screen.findByRole("textbox");
		await user.keyboard("plan.md{Escape}");
		await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
		expect(rowNamed("notes.md")).toBeDefined();
		expect(callsTo(server, "attachments.upload")).toHaveLength(0);
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	// OUT-48. The contract carries no rename, so the page reads the bytes
	// back, uploads them under the new name, and deletes the old row.
	test("Rename replaces the file under the new name and leaves one row", async () => {
		const user = userEvent.setup();
		const recorder = recordingServer(createTestServer());
		renderGrid(recorder.server);
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		const notes = await attachmentNamed(recorder.server, "notes.md");
		await openMenu(user, "notes.md");
		await user.click(screen.getByRole("menuitem", { name: "Rename" }));
		await screen.findByRole("textbox");
		await user.keyboard("plan.md{Enter}");
		await waitFor(() => expect(rowNamed("plan.md")).toBeDefined());
		expect(screen.getAllByText("plan.md")).toHaveLength(1);
		expect(rowNamed("notes.md")).toBeUndefined();
		expect(recorder.requests.filter((request) => request.path === notes.url)).toHaveLength(1);
		const uploads = callsTo(recorder.server, "attachments.upload");
		expect(uploads).toHaveLength(1);
		expect((uploads[0]!.input as { name: string }).name).toBe("plan.md");
		const deletes = callsTo(recorder.server, "attachments.delete");
		expect(deletes).toHaveLength(1);
		expect((deletes[0]!.input as { id: string }).id).toBe(notes.id);
	});

	// OUT-49
	test("Delete removes the row and calls attachments.delete", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		renderGrid(server);
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		const notes = await attachmentNamed(server, "notes.md");
		await openMenu(user, "notes.md");
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));
		await waitFor(() => expect(rowNamed("notes.md")).toBeUndefined());
		const deletes = callsTo(server, "attachments.delete");
		expect(deletes).toHaveLength(1);
		expect((deletes[0]!.input as { id: string }).id).toBe(notes.id);
		expect(screen.getByRole("button", { name: "Actions for rename-flow.png" })).toBeDefined();
	});

	// OUT-51
	test("Escape closes the menu and returns focus to the trigger", async () => {
		const user = userEvent.setup();
		renderGrid(createTestServer());
		await surfaceOf();
		await waitFor(() => expect(rowNamed("notes.md")).toBeDefined());
		const trigger = await openMenu(user, "notes.md");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});
});
