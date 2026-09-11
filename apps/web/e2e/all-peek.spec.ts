import { expect, type Page, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { peekOf, rowOf, signIn } from "./support";

const titles = {
	"APK-1": "Open a ticket from the all-tickets table",
	"APK-2": "Walk the all-tickets rows inside the peek",
	"APK-3": "Return the focus to the row after Escape",
} as const;

// Three tickets with a description each, so the peek shows a body.
test.beforeAll(() => {
	if (!ensureProject("APK", "All peek")) return;
	for (const title of Object.values(titles)) createTicket("APK", title, ["-d", `Notes on ${title}.`]);
});

// The project chip narrows /all to the tickets this spec seeds. Every other
// spec writes to the same server, so without the chip a seeded row can sit
// below the fold.
const allTickets = "/all/table?project=APK";

// The table's row order: status groups in category order, then priority,
// then the last update.
const rowOrder = (page: Page) =>
	page.locator('[role="row"][data-identifier]').evaluateAll((rows) => rows.map((row) => row.dataset.identifier!));

test("a row click on All tickets opens the peek", async ({ page }) => {
	await signIn(page, allTickets);
	await rowOf(page, "APK-2").getByText(titles["APK-2"], { exact: true }).click();
	await expect(page).toHaveURL(/[?&]peek=APK-2(&|$)/);
	const peek = peekOf(page, "APK-2");
	await expect(peek).toBeVisible();
	await expect(peek.getByRole("textbox", { name: "Title" })).toHaveValue(titles["APK-2"]);
});

test("Enter on All tickets opens the peek, j walks, and Escape restores the row focus", async ({ page }) => {
	await signIn(page, allTickets);
	await expect(rowOf(page, "APK-3")).toBeVisible();
	const [first, second] = await rowOrder(page);
	await rowOf(page, first!).focus();
	await page.keyboard.press("Enter");
	await expect(peekOf(page, first!)).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`peek=${first}(&|$)`));
	await page.keyboard.press("j");
	await expect(peekOf(page, second!)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page).not.toHaveURL(/peek=/);
	await expect(rowOf(page, second!)).toBeFocused();
});
