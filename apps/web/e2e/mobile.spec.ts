import { expect, type Locator, type Page, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { cardOf, columnOf, peekOf, rowOf, signIn } from "./support";

const titles = {
	"MOB-1": "Read the ticket page on a phone without a sideways scroll",
	"MOB-2": "Wait for a person to review this on the phone",
} as const;

// A phone in portrait.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(() => {
	if (!ensureProject("MOB", "Mobile")) return;
	createTicket("MOB", titles["MOB-1"], ["-d", "Notes on the phone layout."]);
	createTicket("MOB", titles["MOB-2"]);
	moveTicket("MOB-2", "human-review");
});

// How far the page and the main region scroll sideways, in px.
const sidewaysScroll = (page: Page) =>
	page.evaluate(() => {
		const root = document.documentElement;
		const main = document.querySelector("main")!;
		return { page: root.scrollWidth - root.clientWidth, main: main.scrollWidth - main.clientWidth };
	});

// Each route with the element that shows its content has painted. The board
// is the bare path of a project and of All tickets; the table takes the
// /table segment. Both views of both scopes get the check.
const routes: Array<[string, (page: Page) => Locator]> = [
	["/needs-you", (page) => page.getByRole("heading", { name: "Needs you", exact: true })],
	["/search", (page) => page.getByRole("main").getByRole("searchbox")],
	["/all", (page) => columnOf(page, "Todo")],
	["/all/table", (page) => page.locator('[role="row"][data-identifier]').first()],
	["/p/MOB", (page) => cardOf(columnOf(page, "Todo"), "MOB-1")],
	["/p/MOB/table", (page) => rowOf(page, "MOB-1")],
	["/p/MOB/settings", (page) => page.getByRole("main").getByRole("textbox").first()],
	["/t/MOB-1", (page) => page.getByRole("textbox", { name: "Title" })],
	["/p/MOB?peek=MOB-1", (page) => peekOf(page, "MOB-1")],
	["/settings", (page) => page.getByRole("main").getByRole("textbox").first()],
];

for (const [route, ready] of routes) {
	test(`${route} fits 390 px with no sideways scroll`, async ({ page }) => {
		await signIn(page, route);
		await expect(ready(page)).toBeVisible();
		expect(await sidewaysScroll(page)).toEqual({ page: 0, main: 0 });
	});
}

test("the composer fits 390 px with no sideways scroll", async ({ page }) => {
	await signIn(page, "/p/MOB/table");
	await expect(rowOf(page, "MOB-1")).toBeVisible();
	await page.keyboard.press("c");
	await expect(page.getByRole("dialog")).toBeVisible();
	expect(await sidewaysScroll(page)).toEqual({ page: 0, main: 0 });
	const dialog = await page.getByRole("dialog").boundingBox();
	expect(dialog!.x).toBeGreaterThanOrEqual(0);
	expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
});

// The sidebar is off the page until the menu button opens it, and a pick
// in it closes it again.
test("the sidebar starts closed and the menu button opens it over the page", async ({ page }) => {
	await signIn(page, "/p/MOB/table");
	await expect(rowOf(page, "MOB-1")).toBeVisible();
	await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
	await page.getByRole("button", { name: "Open the sidebar" }).click();
	const sheet = page.getByRole("dialog", { name: "Navigation" });
	await expect(sheet).toBeVisible();
	await sheet.getByRole("link", { name: "All tickets" }).click();
	await expect(page).toHaveURL(/\/all$/);
	await expect(sheet).toBeHidden();
});

// The ticket page has the menu button too, because it has no topbar.
test("the ticket page opens the sidebar from its header", async ({ page }) => {
	await signIn(page, "/t/MOB-1");
	await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
	await page.getByRole("button", { name: "Open the sidebar" }).click();
	await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
});

// The table drops the Project, PR, and Last actor columns, so the title
// keeps at least a third of the 390 px row.
test("the table gives the title a third of the row", async ({ page }) => {
	await signIn(page, "/p/MOB/table");
	const title = rowOf(page, "MOB-1").getByText(titles["MOB-1"], { exact: true });
	await expect(title).toBeVisible();
	const box = (await title.boundingBox())!;
	expect(box.x + box.width).toBeLessThanOrEqual(390);
	expect(box.width).toBeGreaterThanOrEqual(130);
});

// The properties fold into a grid under the title. The grid spans the
// ticket column, which keeps a 16 px gutter on each side of the 390 px page.
test("the ticket page stacks the properties under the title", async ({ page }) => {
	await signIn(page, "/t/MOB-1");
	await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
	const rail = (await page.getByLabel("Properties", { exact: true }).boundingBox())!;
	const title = (await page.getByRole("textbox", { name: "Title" }).boundingBox())!;
	expect(rail.x).toBeLessThanOrEqual(17);
	expect(rail.width).toBeGreaterThanOrEqual(356);
	expect(rail.x + rail.width).toBeLessThanOrEqual(390);
	expect(rail.y).toBeGreaterThan(title.y);
});

test.describe("on a touch screen", () => {
	test.use({ hasTouch: true, isMobile: true });

	// The design checklist sets a 44 px hit area on a coarse pointer.
	test("every sidebar row is at least 44 px tall", async ({ page }) => {
		await signIn(page, "/p/MOB/table");
		await expect(rowOf(page, "MOB-1")).toBeVisible();
		await page.getByRole("button", { name: "Open the sidebar" }).tap();
		const sheet = page.getByRole("dialog", { name: "Navigation" });
		await expect(sheet.getByRole("link", { name: "All tickets" })).toBeVisible();
		const heights = await sheet
			.getByRole("link")
			.evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().height)));
		expect(heights.length).toBeGreaterThanOrEqual(4);
		expect(heights.filter((height) => height < 44)).toEqual([]);
	});
});
