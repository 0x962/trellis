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
	ensureProject("LBL", "Labels");
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

test("writes > a label group and label persist in project settings", async ({ page }) => {
	await signIn(page, "/p/LBL/settings#labels");
	await page.getByRole("button", { name: "Add label group" }).click();
	await page.getByRole("textbox", { name: "Group name" }).fill("Type");
	await page.getByRole("button", { name: "Create group" }).click();
	const group = page.getByRole("region", { name: "Type" });
	await expect(group).toBeVisible();
	const addLabel = group.getByRole("button", { name: "Add a label to Type" });
	await expect(addLabel).toBeFocused();
	await addLabel.click();
	await group.getByRole("textbox", { name: "Label name" }).fill("Bug");
	await group.getByRole("button", { name: "Create label" }).click();
	await expect(group.getByText("Bug", { exact: true })).toBeVisible();
	await expect(addLabel).toBeFocused();
	await page.reload();
	await expect(page.getByRole("region", { name: "Type" }).getByText("Bug", { exact: true })).toBeVisible();
});

test("writes > label forms preserve focus after validation and cancel", async ({ page }) => {
	await signIn(page, "/p/LBL/settings#labels");
	const addGroup = page.getByRole("button", { name: "Add label group" });
	await addGroup.click();

	const groupName = page.getByRole("textbox", { name: "Group name" });
	const createGroup = page.getByRole("button", { name: "Create group" });
	await createGroup.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByText("Enter a group name.")).toBeVisible();
	await expect(groupName).toBeFocused();
	await groupName.fill("Kind");
	await createGroup.focus();
	await page.keyboard.press("Enter");

	const group = page.getByRole("region", { name: "Kind" });
	const addLabel = group.getByRole("button", { name: "Add a label to Kind" });
	await expect(addLabel).toBeFocused();

	await addGroup.click();
	const duplicateGroupName = page.getByRole("textbox", { name: "Group name" });
	await duplicateGroupName.fill("Kind");
	await createGroup.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByText("Use a different group name.")).toBeVisible();
	await expect(duplicateGroupName).toBeFocused();
	await page.getByRole("button", { name: "Cancel" }).focus();
	await page.keyboard.press("Enter");
	await expect(addGroup).toBeFocused();

	await addLabel.click();
	const labelName = group.getByRole("textbox", { name: "Label name" });
	const createLabel = group.getByRole("button", { name: "Create label" });
	await createLabel.focus();
	await page.keyboard.press("Enter");
	await expect(group.getByText("Enter a label name.")).toBeVisible();
	await expect(labelName).toBeFocused();
	await labelName.fill("Task");
	await createLabel.focus();
	await page.keyboard.press("Enter");
	await expect(group.getByText("Task", { exact: true })).toBeVisible();
	await expect(addLabel).toBeFocused();

	await addLabel.click();
	const duplicateLabelName = group.getByRole("textbox", { name: "Label name" });
	await duplicateLabelName.fill("Task");
	await createLabel.focus();
	await page.keyboard.press("Enter");
	await expect(group.getByText("Use a different label name in this group.")).toBeVisible();
	await expect(duplicateLabelName).toBeFocused();
	await group.getByRole("button", { name: "Cancel" }).focus();
	await page.keyboard.press("Enter");
	await expect(addLabel).toBeFocused();
});

test("writes > the search page finds a ticket by a word of its title", async ({ page }) => {
	await signIn(page, "/search?q=kestrel");
	const results = page.getByRole("grid", { name: "Search results" });
	await expect(results.getByText("WRT-1")).toBeVisible();
});
