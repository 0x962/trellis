import { expect, type Page, test } from "@playwright/test";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { peekOf, rowOf, signIn } from "./support";

const titles = {
	"PEK-1": "Restore the fork pages after the upstream 1.27 merge",
	"PEK-2": "Merge upstream 1.27 and keep every marked site",
	"PEK-3": "Terminal pane loses scrollback on session handoff",
} as const;

// Three tickets with a description each, so the peek shows a body. PEK-1
// waits in Human Review.
test.beforeAll(() => {
	if (!ensureProject("PEK", "Peek")) return;
	for (const title of Object.values(titles)) createTicket("PEK", title, ["-d", `Notes on ${title}.`]);
	moveTicket("PEK-1", "human-review");
});

const titleOf = (page: Page, identifier: keyof typeof titles) =>
	rowOf(page, identifier).getByText(titles[identifier], { exact: true });

// The table's row order: status groups in category order, then priority,
// then the last update.
const rowOrder = (page: Page) =>
	page.locator('[role="row"][data-identifier]').evaluateAll((rows) => rows.map((row) => row.dataset.identifier!));

// WT-01. The peek is a search param push; the panel shows the title.
test("a row click opens the peek and writes ?peek to the URL", async ({ page }) => {
	await signIn(page, "/p/PEK");
	await titleOf(page, "PEK-2").click();
	await expect(page).toHaveURL(/[?&]peek=PEK-2(&|$)/);
	const peek = peekOf(page, "PEK-2");
	await expect(peek).toBeVisible();
	await expect(peek.getByRole("textbox", { name: "Title" })).toHaveValue(titles["PEK-2"]);
});

// Enter on the focused row opens its peek, j and k walk the list inside the
// peek, and Escape closes it with the focus back on the row it shows.
test("Enter opens the peek, j and k walk, and Escape restores the row focus", async ({ page }) => {
	await signIn(page, "/p/PEK");
	await expect(rowOf(page, "PEK-3")).toBeVisible();
	const [first, second] = await rowOrder(page);
	await rowOf(page, first!).focus();
	await page.keyboard.press("Enter");
	await expect(peekOf(page, first!)).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`peek=${first}(&|$)`));
	await page.keyboard.press("j");
	await expect(peekOf(page, second!)).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`peek=${second}(&|$)`));
	await page.keyboard.press("k");
	await expect(peekOf(page, first!)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page).not.toHaveURL(/peek=/);
	await expect(rowOf(page, first!)).toBeFocused();
});

// WT-14. Back pops the param push, so the peek closes and the filter stays.
test("browser back closes the peek", async ({ page }) => {
	await signIn(page, "/p/PEK?status=human-review");
	await titleOf(page, "PEK-1").click();
	await expect(page).toHaveURL(/peek=PEK-1/);
	await expect(peekOf(page, "PEK-1")).toBeVisible();
	await page.goBack();
	await expect(peekOf(page, "PEK-1")).toBeHidden();
	await expect(page).toHaveURL(/\/p\/PEK\?status=human-review$/);
});

// The timings are taken inside the page, so the test runner's own polling
// never counts. A capture-phase listener stamps the click and each key; a
// MutationObserver stamps the first paint of the dialog, of its body, and
// of each new dialog name.
const probe = `(() => {
	const marks = { clickAt: 0, keyAt: 0, summaryAt: 0, bodyAt: 0, names: [] };
	window.__peek = marks;
	document.addEventListener("pointerdown", () => { marks.clickAt = performance.now(); }, true);
	document.addEventListener("keydown", () => { marks.keyAt = performance.now(); }, true);
	const seen = new Set();
	new MutationObserver(() => {
		const dialog = document.querySelector('[role="dialog"]');
		if (dialog === null) return;
		const name = dialog.getAttribute("aria-label") ?? dialog.querySelector("h2, [id]")?.textContent ?? "";
		if (marks.summaryAt === 0 && name !== "") marks.summaryAt = performance.now();
		if (marks.bodyAt === 0 && dialog.querySelector(".markdown") !== null) marks.bodyAt = performance.now();
		if (name !== "" && !seen.has(name)) {
			seen.add(name);
			marks.names.push({ name, at: performance.now() });
		}
	}).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})();`;

type Marks = {
	clickAt: number;
	keyAt: number;
	summaryAt: number;
	bodyAt: number;
	names: { name: string; at: number }[];
};

const marks = (page: Page) => page.evaluate(() => (window as unknown as { __peek: Marks }).__peek);

// WT-15. From a warm list cache: the summary within 50 ms, the body within
// 100 ms, and every j step within 50 ms.
test("peek open and j step stay inside the budget", async ({ page }) => {
	await page.addInitScript(probe);
	await signIn(page, "/p/PEK");
	await expect(rowOf(page, "PEK-3")).toBeVisible();
	const [first] = await rowOrder(page);
	await rowOf(page, first!).getByRole("gridcell").nth(2).click();
	await expect(peekOf(page, first!).locator(".markdown")).toBeVisible();
	const opened = await marks(page);
	expect(opened.clickAt).toBeGreaterThan(0);
	console.log(`peek: summary ${opened.summaryAt - opened.clickAt} ms, body ${opened.bodyAt - opened.clickAt} ms`);
	expect(opened.summaryAt - opened.clickAt).toBeLessThanOrEqual(50);
	expect(opened.bodyAt - opened.clickAt).toBeLessThanOrEqual(100);
	for (let step = 0; step < 2; step++) {
		const before = (await marks(page)).names.length;
		await page.keyboard.press("j");
		await expect.poll(async () => (await marks(page)).names.length).toBe(before + 1);
		const after = await marks(page);
		const shown = after.names[after.names.length - 1]!;
		await expect(peekOf(page, shown.name)).toBeVisible();
		console.log(`peek: j step ${shown.at - after.keyAt} ms`);
		expect(shown.at - after.keyAt).toBeLessThanOrEqual(50);
	}
});
