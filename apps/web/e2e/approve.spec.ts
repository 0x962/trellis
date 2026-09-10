import { expect, test } from "@playwright/test";
import { clearNonReviewSections, createReviewTickets, get, inbox, statusOf } from "./api";

// The first-run name step, which every fresh browser context sees.
const signIn = async (page: import("@playwright/test").Page) => {
	await page.goto("/needs-you");
	const name = page.getByRole("textbox", { name: /name/i });
	await name.fill("navid");
	await name.press("Enter");
};

// E2E-01. Ten keystrokes clear the screen, which is the whole point of the
// home screen.
test("approve > clears ten review rows with ten a presses", async ({ page }) => {
	await clearNonReviewSections();
	const current = await inbox();
	for (const item of current.review.items) await get(`/tickets/${item.identifier}`);
	const before = current.review.total;
	const created = await createReviewTickets(10);
	await signIn(page);
	await page.goto("/needs-you");
	const rows = page.locator("[data-inbox-row]");
	await expect(rows).toHaveCount(before + 10);
	await rows.first().focus();
	for (let press = 0; press < before + 10; press += 1) await page.keyboard.press("a");
	await expect(page.getByText("Nothing needs you.")).toBeVisible();
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await expect(sidebar.getByRole("link", { name: /Needs you/ })).not.toContainText(/\d/);
	for (const identifier of created) expect(await statusOf(identifier)).toBe("Done");
});

// E2E-02. The comment is what the agent reads next.
test("approve > send back posts the comment and moves the ticket", async ({ page }) => {
	const [identifier] = await createReviewTickets(1);
	await signIn(page);
	await page.goto("/needs-you");
	const row = page.locator(`[data-inbox-row="${identifier}"]`);
	await row.focus();
	await page.keyboard.press("r");
	const box = page.getByRole("textbox", { name: /What should change/i });
	await box.fill("Fix the migration");
	await page.keyboard.press("Meta+Enter");
	await expect(row).toHaveCount(0);
	const timeline = await get<{ items: { kind: string; body?: string }[] }>(`/tickets/${identifier}/timeline`);
	expect(timeline.items.some((item) => item.kind === "comment" && item.body === "Fix the migration")).toBe(true);
	expect(await statusOf(identifier!)).toBe("In Progress");
});
