import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { dropFiles, signIn } from "./support";

// A 1x1 PNG.
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

test.beforeAll(() => {
	if (!ensureProject("ATT", "Attachments")) return;
	createTicket("ATT", "Attach the board screenshot");
	createTicket("ATT", "Attach the logo");
});

const region = (page: Page, ticket: string) => page.getByRole("region", { name: `Attachments for ${ticket}` });

// The ticket body takes a drop anywhere on it, not only on the
// attachments section.
const ticketBody = (page: Page) => page.locator("[data-ticket-content]");

// An image and a file with no extension, dropped on the ticket: the image
// shows as a decoded thumbnail, the file as a row, and the page still loads.
test("attachments > a dropped image and an extensionless file show, and the ticket page reloads", async ({ page }) => {
	await signIn(page, "/t/ATT-1");
	await expect(region(page, "ATT-1")).toBeAttached();
	await dropFiles(page, ticketBody(page), [
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
	await dropFiles(page, ticketBody(page), [{ name: "logo.svg", type: "image/svg+xml", text: svg }]);
	const link = page.getByRole("link", { name: "Download logo.svg" });
	await expect(link).toBeVisible();
	await expect(region(page, "ATT-2").locator('img[alt="logo.svg"]')).toHaveCount(0);
	const pending = page.waitForEvent("download");
	await link.click();
	const download = await pending;
	expect(download.suggestedFilename()).toBe("logo.svg");
	expect(readFileSync(await download.path(), "utf8")).toBe(svg);
});
