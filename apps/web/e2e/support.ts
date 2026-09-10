import type { Page } from "@playwright/test";

// Every spec starts with an empty localStorage, so the first run asks for a
// name. The fake server holds the canvas seed: CDE-42 and its list.
export const signIn = async (page: Page, path: string) => {
	await page.goto(path);
	const name = page.getByRole("textbox", { name: /name/i });
	if (await name.isVisible({ timeout: 2000 }).catch(() => false)) {
		await name.fill("navid");
		await name.press("Enter");
		await page.goto(path);
	}
};

export const titleOf = {
	"CDE-42": "Restore the fork pages after the upstream 1.27 merge",
	"CDE-43": "Merge upstream 1.27 and keep every marked site",
	"CDE-44": "Terminal pane loses scrollback on session handoff",
} as const;

// The list row of a ticket: the element that shows its title. A click on
// the identifier chip opens the full page, so the title is the target.
export const rowOf = (page: Page, identifier: keyof typeof titleOf) =>
	page.getByRole("main").getByText(titleOf[identifier], { exact: true }).first();

export const peekOf = (page: Page, identifier: string) => page.getByRole("dialog", { name: identifier });
