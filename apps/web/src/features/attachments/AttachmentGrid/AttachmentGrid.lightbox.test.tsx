import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addAttachment, surfaceOf, thumbnailsOf } from "../../../../test/attachments";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AttachmentGrid } from "./AttachmentGrid";

beforeEach(() => localStorage.clear());

// CDE-51 carries no attachment in the seed, so each test states its own set.
const ticket = "CDE-51";

const renderGrid = (server: FakeServer) =>
	renderWithProviders(<AttachmentGrid ticket={ticket} />, { path: `/t/${ticket}`, actor: "navid", server });

const withImages = (names: string[], extras: Array<[string, string]> = []) => {
	const server = createFakeServer();
	const images = names.map((name) => addAttachment(server, ticket, name, "image/png"));
	for (const [name, mime] of extras) addAttachment(server, ticket, name, mime);
	renderGrid(server);
	return { server, images };
};

const thumbnailFor = (id: string) => document.querySelector<HTMLElement>(`[data-thumbnail="${id}"]`)!;

const shownImage = () => screen.getByRole("dialog").querySelector("img")!.getAttribute("src");

describe("lightbox", () => {
	// OUT-37
	test("a thumbnail opens the lightbox on its own image", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png", "c.png"]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(3));
		await user.click(thumbnailFor(images[0]!.id));
		const dialog = await screen.findByRole("dialog", { name: /a\.png/ });
		expect(dialog.querySelector("img")!.getAttribute("src")).toBe(images[0]!.url);
		await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
	});

	// OUT-38
	test("the arrow keys walk the images in grid order", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png", "c.png"]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(3));
		await user.click(thumbnailFor(images[0]!.id));
		await screen.findByRole("dialog");
		await user.keyboard("{ArrowRight}{ArrowRight}{ArrowLeft}");
		await waitFor(() => expect(shownImage()).toBe(images[1]!.url));
	});

	// OUT-39
	test("the walk stops at the last image", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png", "c.png"]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(3));
		await user.click(thumbnailFor(images[2]!.id));
		await screen.findByRole("dialog");
		await user.keyboard("{ArrowRight}");
		expect(shownImage()).toBe(images[2]!.url);
	});

	// OUT-40. The grid keeps the keyboard where the reader left it.
	test("Escape closes the lightbox and returns focus to the thumbnail", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png", "c.png"]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(3));
		await user.click(thumbnailFor(images[0]!.id));
		await screen.findByRole("dialog");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(thumbnailFor(images[0]!.id)));
	});

	// OUT-41
	test("returns focus to the thumbnail of the image last shown", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png", "c.png"]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(3));
		await user.click(thumbnailFor(images[0]!.id));
		await screen.findByRole("dialog");
		await user.keyboard("{ArrowRight}");
		await waitFor(() => expect(shownImage()).toBe(images[1]!.url));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(document.activeElement).toBe(thumbnailFor(images[1]!.id)));
	});

	// OUT-42
	test("walks the images and skips the other files", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png"], [["notes.md", "text/markdown"]]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(2));
		await user.click(thumbnailFor(images[0]!.id));
		await screen.findByRole("dialog");
		await user.keyboard("{ArrowRight}{ArrowRight}");
		expect(shownImage()).toBe(images[1]!.url);
	});

	// OUT-50
	test("a deleted image leaves the walk", async () => {
		const user = userEvent.setup();
		const { images } = withImages(["a.png", "b.png"]);
		await surfaceOf();
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(2));
		await user.click(screen.getByRole("button", { name: "Actions for a.png" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await waitFor(() => expect(thumbnailsOf()).toHaveLength(1));
		await user.click(thumbnailFor(images[1]!.id));
		await screen.findByRole("dialog");
		await user.keyboard("{ArrowLeft}{ArrowRight}");
		expect(shownImage()).toBe(images[1]!.url);
	});
});
