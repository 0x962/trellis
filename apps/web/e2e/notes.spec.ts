import { expect, test } from "@playwright/test";
import type { Project } from "@trellis/api";
import { post } from "./api";
import { signIn } from "./support";

// The notes page of a project: an empty state, a sheet that creates a note,
// a card per note, the same sheet to change and to delete it.
test("a person writes, changes, and deletes a project note", async ({ page }) => {
	await post<Project>("/projects", { key: "NOTE", name: "Notes project" });
	await signIn(page, "/p/NOTE/notes");
	await expect(page.getByText("No notes yet")).toBeVisible();

	await page.getByRole("button", { name: "New note", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "New note", exact: true });
	await sheet.getByRole("textbox", { name: "Title", exact: true }).fill("Fresh worktree");
	await sheet.getByRole("textbox", { name: "Body", exact: true }).fill("Run bun install before the first check.");
	await sheet.getByRole("button", { name: "Create note", exact: true }).click();
	const card = page.getByRole("article", { name: "Fresh worktree" });
	await expect(card).toBeVisible();
	await expect(card).toContainText("Run bun install before the first check.");

	await card.getByRole("button", { name: "Edit Fresh worktree", exact: true }).click();
	const editor = page.getByRole("dialog", { name: "Edit note", exact: true });
	await editor.getByRole("textbox", { name: "Body", exact: true }).fill("A new worktree has no node_modules.");
	await editor.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(card).toContainText("A new worktree has no node_modules.");

	await card.getByRole("button", { name: "Edit Fresh worktree", exact: true }).click();
	await editor.getByRole("button", { name: "Delete note", exact: true }).click();
	await editor.getByRole("button", { name: "Confirm delete", exact: true }).click();
	await expect(page.getByText("No notes yet")).toBeVisible();
});
