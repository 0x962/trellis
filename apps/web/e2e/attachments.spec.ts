import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

// A 1x1 PNG.
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

type DroppedFile = { name: string; type: string; base64?: string; text?: string };

test.beforeAll(() => {
	if (!ensureProject("ATT", "Attachments")) return;
	createTicket("ATT", "Attach the board screenshot");
	createTicket("ATT", "Attach the logo");
	createTicket("ATT", "Delete the notes file");
});

const region = (page: Page, ticket: string) => page.getByRole("region", { name: `Attachments for ${ticket}` });

// Drops `files` on the attachments region of the ticket page, the way a
// file dragged from the desktop arrives: dragenter, dragover, then drop.
const dropFiles = async (page: Page, ticket: string, files: DroppedFile[]) => {
	const dataTransfer = await page.evaluateHandle((entries: DroppedFile[]) => {
		const transfer = new DataTransfer();
		for (const entry of entries) {
			const body =
				entry.base64 === undefined ? entry.text! : Uint8Array.from(atob(entry.base64), (char) => char.charCodeAt(0));
			transfer.items.add(new File([body], entry.name, { type: entry.type }));
		}
		return transfer;
	}, files);
	const target = region(page, ticket);
	for (const type of ["dragenter", "dragover", "drop"]) await target.dispatchEvent(type, { dataTransfer });
};

// An image and a file with no extension, dropped on the ticket: the image
// shows as a decoded thumbnail, the file as a row, and the page still loads.
test("attachments > a dropped image and an extensionless file show, and the ticket page reloads", async ({ page }) => {
	await signIn(page, "/t/ATT-1");
	await expect(region(page, "ATT-1")).toBeAttached();
	await dropFiles(page, "ATT-1", [
		{ name: "board.png", type: "image/png", base64: png },
		{ name: "NOTES", type: "", text: "plain notes" },
	]);
	const thumbnail = region(page, "ATT-1").locator('img[alt="board.png"]');
	await expect(thumbnail).toBeVisible();
	await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
	await expect(page.getByRole("link", { name: "Download NOTES" })).toBeVisible();
	await page.reload();
	await expect(region(page, "ATT-1").locator('img[alt="board.png"]')).toBeVisible();
	await expect(page.getByRole("link", { name: "Download NOTES" })).toBeVisible();
});

// An SVG never renders inline. Its row downloads the file with its own name
// and its own bytes.
test("attachments > an uploaded SVG downloads with its name and bytes", async ({ page }) => {
	await signIn(page, "/t/ATT-2");
	await expect(region(page, "ATT-2")).toBeAttached();
	await dropFiles(page, "ATT-2", [{ name: "logo.svg", type: "image/svg+xml", text: svg }]);
	const link = page.getByRole("link", { name: "Download logo.svg" });
	await expect(link).toBeVisible();
	await expect(region(page, "ATT-2").locator('img[alt="logo.svg"]')).toHaveCount(0);
	const pending = page.waitForEvent("download");
	await link.click();
	const download = await pending;
	expect(download.suggestedFilename()).toBe("logo.svg");
	expect(readFileSync(await download.path(), "utf8")).toBe(svg);
});

// A delete is permanent, so the row menu asks first. Cancel keeps the file.
test("attachments > Delete asks for a confirm, and the confirm removes the row", async ({ page }) => {
	await signIn(page, "/t/ATT-3");
	await expect(region(page, "ATT-3")).toBeAttached();
	await dropFiles(page, "ATT-3", [{ name: "notes.txt", type: "text/plain", text: "plain notes" }]);
	const link = page.getByRole("link", { name: "Download notes.txt" });
	await expect(link).toBeVisible();

	await region(page, "ATT-3").getByRole("button", { name: "Actions for notes.txt" }).click();
	await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Delete notes.txt?" });
	await expect(dialog).toContainText("trellis cannot restore a deleted file.");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(link).toBeVisible();

	await region(page, "ATT-3").getByRole("button", { name: "Actions for notes.txt" }).click();
	await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
	await page
		.getByRole("dialog", { name: "Delete notes.txt?" })
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	await expect(link).toHaveCount(0);
});
