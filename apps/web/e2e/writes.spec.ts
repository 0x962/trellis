import { expect, type Response, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

// The answer to the comments.create call. The batch link can fold the call
// into a batch request, so the path is looked for in the request body too.
const COMMENT_PATH = "/rpc/comments/create";
const isComment = (response: Response) =>
	response.ok() &&
	(response.url().includes(COMMENT_PATH) || (response.request().postData() ?? "").includes(COMMENT_PATH));

// WRT-1 is the parent and WRT-2 its child, so the Sub-tickets section and
// its add field show on WRT-1.
test.beforeAll(() => {
	if (!ensureProject("WRT", "Writes")) return;
	createTicket("WRT", "Ship the kestrel export");
	createTicket("WRT", "Write the export docs", ["--parent", "WRT-1"]);
	ensureProject("STS", "Statuses");
});

// Add opens the create dialog with this ticket as the parent, so a
// sub-ticket takes every field a ticket takes.
test("writes > a sub-ticket added on the ticket page shows under its parent", async ({ page }) => {
	await signIn(page, "/t/WRT-1");
	const section = page.getByRole("region", { name: /Sub-tickets/ });
	await expect(section.getByRole("button", { name: /WRT-2/ })).toBeVisible();
	await section.getByRole("button", { name: "Add" }).click();
	const composer = page.getByRole("dialog", { name: "New ticket" });
	await expect(composer).toBeVisible();
	await composer.getByRole("textbox", { name: "Title" }).fill("Record the export demo");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(composer).toBeHidden();
	await expect(section.getByRole("button", { name: /Record the export demo/ })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("region", { name: /Sub-tickets/ }).getByRole("button", { name: /Record the export demo/ }),
	).toBeVisible();
});

test("writes > a comment posted on the ticket page shows in the timeline and survives a reload", async ({ page }) => {
	await signIn(page, "/t/WRT-1");
	await page.getByRole("textbox", { name: "Comment" }).fill("The export needs the kestrel flag.");
	// The timeline draws the comment before the server answers, so the reload
	// waits for the write. A reload over the open call drops the comment.
	const saved = page.waitForResponse(isComment);
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await expect(page.getByText("The export needs the kestrel flag.")).toBeVisible();
	await saved;
	await page.reload();
	await expect(page.getByText("The export needs the kestrel flag.")).toBeVisible();
});

test("writes > a status added in project settings shows in the status list", async ({ page }) => {
	// Project settings groups its rows into sections, and the hash picks one.
	await signIn(page, "/p/STS/settings#statuses");
	await page.getByRole("button", { name: "Add a status to Todo" }).click();
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
