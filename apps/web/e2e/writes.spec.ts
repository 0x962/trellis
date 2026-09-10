import { expect, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

// WRT-1 is the parent and WRT-2 its child, so the Sub-tickets section and
// its add field show on WRT-1.
test.beforeAll(() => {
	if (!ensureProject("WRT", "Writes")) return;
	createTicket("WRT", "Ship the kestrel export");
	createTicket("WRT", "Write the export docs", ["--parent", "WRT-1"]);
	ensureProject("STS", "Statuses");
});

test("writes > a sub-ticket added on the ticket page shows under its parent", async ({ page }) => {
	await signIn(page, "/t/WRT-1");
	const section = page.getByRole("region", { name: /Sub-tickets/ });
	await expect(section.getByRole("button", { name: /WRT-2/ })).toBeVisible();
	await section.getByRole("textbox", { name: "New sub-ticket" }).fill("Record the export demo");
	await page.keyboard.press("Enter");
	await expect(section.getByRole("button", { name: /Record the export demo/ })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("region", { name: /Sub-tickets/ }).getByRole("button", { name: /Record the export demo/ }),
	).toBeVisible();
});

test("writes > a comment posted on the ticket page shows in the timeline and survives a reload", async ({ page }) => {
	await signIn(page, "/t/WRT-1");
	await page.getByRole("textbox", { name: "Comment" }).fill("The export needs the kestrel flag.");
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await expect(page.getByText("The export needs the kestrel flag.")).toBeVisible();
	await page.reload();
	await expect(page.getByText("The export needs the kestrel flag.")).toBeVisible();
});

test("writes > a status added in project settings shows in the status list", async ({ page }) => {
	await signIn(page, "/p/STS/settings");
	await page.getByRole("button", { name: "New status" }).click();
	await page.getByRole("textbox", { name: "Status name" }).fill("Security Review");
	await page.getByRole("button", { name: "Create status" }).click();
	await expect(page.getByRole("listitem").filter({ hasText: "Security Review" })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("listitem").filter({ hasText: "Security Review" })).toBeVisible();
});

test("writes > the search page finds a ticket by a word of its title", async ({ page }) => {
	await signIn(page, "/search?q=kestrel");
	const results = page.getByRole("grid", { name: "Search results" });
	await expect(results.getByText("WRT-1")).toBeVisible();
});
