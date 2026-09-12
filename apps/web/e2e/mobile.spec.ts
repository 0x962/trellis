import { expect, type Locator, type Page, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { cardOf, columnOf, rowOf, signIn } from "./support";

const titles = {
	"MOB-1": "Read the ticket page on a phone without a sideways scroll",
	"MOB-2": "Wait for a person to review this on the phone",
} as const;

// A phone in portrait.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(() => {
	// A project whose name is wider than the phone bar, for the title that
	// the view switch used to paint over.
	ensureProject("LNG", "Long project name for a narrow phone bar");
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

// Every control whose tap target is under `min` px, as `tag "label" WxH
// tall=… wide=…`. The probe hit-tests four points `min / 2` from the centre
// of a control with `document.elementFromPoint`: a point counts when the
// topmost element there is the control or something inside it. A ::before
// hit-area layer therefore counts, and a neighbour that paints over one
// does not. A control the viewport cuts is left out, and so is a control
// whose own centre another element covers, because a person can tap
// neither. A box under 2 px is left out too: Base UI carries the form value
// of a Segmented item and of a Checkbox in a 1 px input behind the control
// it draws, and the drawn control is the one this probe measures.
const tooSmall = (page: Page, min: number) =>
	page.evaluate((need: number) => {
		const selector =
			"button, a[href], [role='button'], input:not([type=hidden]), select, textarea, [role='tab'], [role='menuitem'], [role='option'], [role='switch'], [role='checkbox']";
		const small: string[] = [];
		for (const element of document.querySelectorAll(selector)) {
			const box = element.getBoundingClientRect();
			if (box.width < 2 || box.height < 2) continue;
			if (box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) continue;
			const x = box.left + box.width / 2;
			const y = box.top + box.height / 2;
			const hits = (px: number, py: number) => {
				const top = document.elementFromPoint(px, py);
				return top !== null && (top === element || element.contains(top) || top.contains(element));
			};
			if (!hits(x, y)) continue;
			const tall = hits(x, y - need + 1) && hits(x, y + need - 1);
			const wide = hits(x - need + 1, y) && hits(x + need - 1, y);
			if (tall && wide) continue;
			const label = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 34);
			small.push(
				`${element.tagName.toLowerCase()} "${label}" ${Math.round(box.width)}x${Math.round(box.height)} tall=${tall} wide=${wide}`,
			);
		}
		return [...new Set(small)];
	}, min / 2);

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
	["/settings", (page) => page.getByRole("main").getByRole("textbox").first()],
];

// The screens TRL-31 covers, with the element that shows each one has
// painted. TRL-44 adds Needs you, which the audit measured at 36 px rows
// and 32 px section headers. MOB-2 sits in a human review status, so the
// Review section holds a row whenever this spec has seeded its project.
const screens: Array<[string, string, (page: Page) => Locator]> = [
	["needs you", "/needs-you", (page) => page.locator('[data-inbox-row="MOB-2"]')],
	["all tickets", "/all/table", (page) => page.locator('[role="row"][data-identifier]').first()],
	["the project board", "/p/MOB", (page) => cardOf(columnOf(page, "Todo"), "MOB-1")],
	["the ticket page", "/t/MOB-1", (page) => page.getByRole("textbox", { name: "Title" })],
	["the search results", "/search?q=phone", (page) => page.getByRole("grid", { name: "Search results" })],
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

// TRL-29. The view switch is opaque and never shrinks, so the title must
// truncate before it. The title box ends where the switch begins.
test("the board title ends before the view switch at 390 px", async ({ page }) => {
	await signIn(page, "/p/LNG");
	const title = page.getByRole("heading", { level: 1, name: "Long project name for a narrow phone bar" });
	await expect(title).toBeVisible();
	const titleBox = (await title.boundingBox())!;
	const switchBox = (await page.getByRole("radiogroup", { name: "View" }).boundingBox())!;
	expect(titleBox.width).toBeGreaterThan(0);
	expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(switchBox.x);
	expect(await sidewaysScroll(page)).toEqual({ page: 0, main: 0 });
});

// The room the heading box gives the project name, against the room the
// first `count` characters and the ellipsis need. A truncating box keeps
// room for the ellipsis, so the name shows `count` characters only when the
// box holds both. The probe measures the text with the heading's own
// computed font, so it reads the same glyphs the browser paints.
const headingRoom = (title: Locator, count: number) =>
	title.evaluate((heading: HTMLElement, chars: number) => {
		const style = getComputedStyle(heading);
		const context = document.createElement("canvas").getContext("2d")!;
		context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		return {
			has: heading.getBoundingClientRect().width,
			needs: context.measureText(heading.textContent!.slice(0, chars)).width + context.measureText("…").width,
		};
	}, count);

// TRL-45. The phone topbar packed a toggle, a project key chip, the title,
// a two-segment view switch, and New ticket into 390 px, and the title
// truncated to one glyph. The name carries the page, so the bar gives it
// room for at least 8 characters. A phone drives a coarse pointer, which
// draws the sidebar toggle at 44 px and takes 16 px more from the bar than
// a mouse does, so the measurement runs under that pointer.
test.describe("on a phone pointer", () => {
	test.use({ hasTouch: true, isMobile: true });

	test("the board title shows at least 8 characters at 390 px", async ({ page }) => {
		await signIn(page, "/p/LNG");
		const title = page.getByRole("heading", { level: 1, name: "Long project name for a narrow phone bar" });
		await expect(title).toBeVisible();
		const room = await headingRoom(title, 8);
		expect(room.needs).toBeGreaterThan(0);
		expect(room.has).toBeGreaterThanOrEqual(room.needs);
		// The room comes out of the bar, so both controls beside the title stay.
		const bar = page.locator("header");
		await expect(bar.getByRole("radio", { name: "Table" })).toBeVisible();
		await expect(bar.getByRole("radio", { name: "Board" })).toBeVisible();
		await expect(bar.getByRole("button", { name: "New ticket c" })).toBeVisible();
		expect(await sidewaysScroll(page)).toEqual({ page: 0, main: 0 });
	});
});

// TRL-28 and TRL-31. Below 768 px the search row takes the table's phone
// treatment: one cell over the whole row, and the title on its own line, so
// the title keeps the room the fixed columns took.
test("a search result gives the title half of the 390 px row", async ({ page }) => {
	await signIn(page, "/search?q=sideways");
	const row = page.getByRole("grid", { name: "Search results" }).getByRole("row").filter({ hasText: "MOB-1" });
	await expect(row).toHaveCount(1);
	const cells = row.locator("td:visible");
	await expect(cells).toHaveCount(1);
	const title = cells.first().locator('[data-line="title"]');
	await expect(title).toContainText("Read the ticket page on a phone");
	const box = (await title.boundingBox())!;
	expect(box.width).toBeGreaterThanOrEqual(200);
	expect(box.x + box.width).toBeLessThanOrEqual(390);
	expect(await sidewaysScroll(page)).toEqual({ page: 0, main: 0 });
});

// TRL-36. The list bar under the table and under the board is a fixed 28 px.
// The probe reads the bar's own overflow, the way the audit measured it: a
// span that wraps makes `scrollHeight` taller than `clientHeight`, and the
// second line then falls outside the bar. It also returns the bar's box, so
// the test can check what sits above it.
const footerOverflow = (page: Page) =>
	page.evaluate(() => {
		const bar = document.querySelector<HTMLElement>("[data-list-footer]")!;
		const box = bar.getBoundingClientRect();
		const wraps = [...bar.querySelectorAll("span")].filter(
			(span) => getComputedStyle(span).whiteSpace !== "nowrap" && span.textContent !== "",
		);
		return {
			scrollHeight: bar.scrollHeight,
			clientHeight: bar.clientHeight,
			top: box.top,
			height: Math.round(box.height),
			// `innerText` leaves out a span that `display: none` removes, so it
			// reads what a person sees and `textContent` does not.
			text: bar.innerText.trim(),
			wraps: wraps.length,
		};
	});

for (const [name, path, ready] of [
	["the table", "/all/table", (page: Page) => page.locator('[role="row"][data-identifier]').first()],
	["the board", "/p/MOB", (page: Page) => cardOf(columnOf(page, "Todo"), "MOB-1")],
] as const) {
	test(`the list bar under ${name} holds one line at 390 px`, async ({ page }) => {
		await signIn(page, path);
		await expect(ready(page)).toBeVisible();
		await page.waitForTimeout(400);
		const bar = await footerOverflow(page);
		expect(bar.height).toBe(28);
		expect(bar.scrollHeight).toBe(bar.clientHeight);
		expect(bar.wraps).toBe(0);
		// The sort label leaves the bar below 640 px, so the count stands alone.
		expect(bar.text).not.toContain("Sorted by");
		expect(bar.text).toMatch(/\d+ (ticket|open)/);
	});
}

// TRL-36. The audit shot All tickets, a list of 43 across four projects. The
// bar there wrapped to two lines, and the second line of each span fell under
// the bottom edge of the bar and of the page, so a person read "43" with no
// noun and half of the sort label. Every span the bar shows now sits between
// the top edge and the bottom edge of the bar.
test("every span of the list bar sits inside the bar on All tickets at 390 px", async ({ page }) => {
	await signIn(page, "/all/table");
	await expect(page.locator('[role="row"][data-identifier]').first()).toBeVisible();
	await page.waitForTimeout(400);
	const bar = await page.evaluate(() => {
		const element = document.querySelector<HTMLElement>("[data-list-footer]")!;
		const box = element.getBoundingClientRect();
		const spans = [...element.querySelectorAll("span")]
			.filter((span) => getComputedStyle(span).display !== "none")
			.map((span) => {
				const rect = span.getBoundingClientRect();
				return { text: span.textContent!, top: rect.top, bottom: rect.bottom };
			});
		return { top: box.top, bottom: box.bottom, spans };
	});
	// A span is a flex item, so it draws one block box however many lines the
	// text takes. A second line therefore grows the box past the fixed bar,
	// which is what these two bounds read.
	expect(bar.spans.length).toBeGreaterThan(0);
	for (const span of bar.spans) {
		expect(span.top).toBeGreaterThanOrEqual(bar.top);
		expect(span.bottom).toBeLessThanOrEqual(bar.bottom);
	}
});

test("the ticket page stacks the properties under the title", async ({ page }) => {
	await signIn(page, "/t/MOB-1");
	await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
	const rail = (await page.getByLabel("Properties", { exact: true }).boundingBox())!;
	const title = (await page.getByRole("textbox", { name: "Title" }).boundingBox())!;
	expect(rail.x).toBe(title.x);
	expect(rail.width).toBe(title.width);
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

	// TRL-31. Every control that a person can reach on a phone takes a tap
	// 22 px from its centre on all four sides. The probe hit-tests the page
	// with `document.elementFromPoint`, so it counts a ::before layer and it
	// also counts an element that paints over one. A rectangle alone answers
	// neither question.
	for (const [name, path, ready] of screens) {
		test(`every control on ${name} takes a tap 44 px wide at 390 px`, async ({ page }) => {
			await signIn(page, path);
			await expect(ready(page)).toBeVisible();
			// The board and the list settle their virtual rows one frame late.
			await page.waitForTimeout(400);
			expect(await tooSmall(page, 44)).toEqual([]);
		});
	}

	test("every control in the create composer takes a tap 44 px wide at 390 px", async ({ page }) => {
		await signIn(page, "/p/MOB/table");
		await expect(rowOf(page, "MOB-1")).toBeVisible();
		await page.keyboard.press("c");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.waitForTimeout(400);
		expect(await tooSmall(page, 44)).toEqual([]);
	});
});
