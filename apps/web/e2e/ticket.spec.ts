import { expect, test } from "@playwright/test";
import { peekOf, rowOf, signIn } from "./support";

// WT-17. The sidebar carries a Search link of its own, so the check stays
// inside main.
test("an unknown identifier shows the not-found line and a search link", async ({ page }) => {
	await signIn(page, "/t/CDE-999");
	const main = page.getByRole("main");
	await expect(main.getByText("CDE-999 doesn't exist")).toBeVisible();
	const link = main.getByRole("link", { name: /search/i });
	await expect(link).toHaveAttribute("href", "/search?q=CDE-999");
});

// WT-18. The page remembers the list it came from, filters included, across
// a page-to-page hop: the peek on CDE-43, its full page, then its child
// CDE-42 on the page.
test("Back to list keeps the previous search params", async ({ page }) => {
	await signIn(page, "/p/CDE?status=in-progress");
	await rowOf(page, "CDE-43").click();
	await expect(peekOf(page, "CDE-43")).toBeVisible();
	await page.keyboard.press("o");
	await expect(page).toHaveURL(/\/t\/CDE-43$/);
	await page
		.getByRole("region", { name: /Sub-tickets/ })
		.getByRole("button", { name: /CDE-42/ })
		.click();
	await expect(page).toHaveURL(/\/t\/CDE-42$/);
	await page.getByRole("link", { name: "Back to list" }).click();
	await expect(page).toHaveURL(/\/p\/CDE\?status=in-progress$/);
});
