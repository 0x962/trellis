import { expect, test } from "@playwright/test";
import { ensureProject } from "./cli";
import { signIn } from "./support";

test.beforeAll(() => ensureProject("RVW", "Local reviews"));

test("reviews > a local draft becomes a persistent thread and keeps replies", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await signIn(page, "/reviews/acme/web/7");
	await expect(page.locator("diffs-container")).toHaveCount(1);
	await page.getByRole("radio", { name: "Split", exact: true }).check();
	await expect(page.locator("[data-diff-type='split']")).toBeVisible();
	await page.locator("diffs-container [data-line-type='change-addition'][data-line-index]").last().click();
	const composer = page.getByRole("form", { name: "Add review comment" });
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await composer.getByRole("textbox", { name: "Comment", exact: true }).fill("Keep the value within the transaction.");
	await composer.getByRole("button", { name: "Add to review" }).click();
	await expect(page.getByRole("article", { name: "Draft comment" })).toContainText("Keep the value");
	await page.getByRole("button", { name: "Submit review", exact: true }).click();
	const submit = page.getByRole("dialog", { name: "Submit local review" });
	await submit.getByRole("checkbox", { name: "Submit without a notification" }).check();
	await submit.getByRole("button", { name: "Submit review", exact: true }).click();
	await expect(page.getByRole("tab", { name: "Changes", exact: true })).toHaveAttribute("aria-selected", "true");
	const thread = page.getByRole("article", { name: "Thread by dana" }).last();
	await thread.getByRole("textbox", { name: "Reply" }).fill("Fixed and verified.");
	await thread.getByRole("button", { name: "Post reply" }).click();
	await expect(thread.getByRole("textbox", { name: "Reply" })).toBeFocused();
	await thread.getByRole("button", { name: "Resolve thread" }).click();
	await expect(thread).toContainText("Resolved by dana");
	await page.reload();
	await expect(page.getByRole("article", { name: "Thread by dana" }).last()).toContainText("Resolved by dana");
	expect(errors).toEqual([]);
});
