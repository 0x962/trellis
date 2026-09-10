import { expect, test } from "@playwright/test";
import { peekOf, rowOf, signIn, titleOf } from "./support";

// WT-01. The peek is a search param push; the panel shows the title.
test("a row click opens the peek and writes ?peek to the URL", async ({ page }) => {
	await signIn(page, "/p/CDE");
	await rowOf(page, "CDE-42").click();
	await expect(page).toHaveURL(/[?&]peek=CDE-42(&|$)/);
	const peek = peekOf(page, "CDE-42");
	await expect(peek).toBeVisible();
	await expect(peek.getByRole("textbox", { name: "Title" })).toHaveValue(titleOf["CDE-42"]);
});

// WT-14. Back pops the param push, so the peek closes and the filter stays.
test("browser back closes the peek", async ({ page }) => {
	await signIn(page, "/p/CDE?status=human-review");
	await rowOf(page, "CDE-42").click();
	await expect(page).toHaveURL(/peek=CDE-42/);
	await expect(peekOf(page, "CDE-42")).toBeVisible();
	await page.goBack();
	await expect(peekOf(page, "CDE-42")).toBeHidden();
	await expect(page).toHaveURL(/\/p\/CDE\?status=human-review$/);
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
	}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
})();`;

type Marks = {
	clickAt: number;
	keyAt: number;
	summaryAt: number;
	bodyAt: number;
	names: { name: string; at: number }[];
};

const marks = (page: Parameters<typeof signIn>[0]) =>
	page.evaluate(() => (window as unknown as { __peek: Marks }).__peek);

// WT-15. From a warm list cache: the summary within 50 ms, the body within
// 100 ms, and every j step within 50 ms.
test("peek open and j step stay inside the budget", async ({ page }) => {
	await page.addInitScript(probe);
	await signIn(page, "/p/CDE");
	const row = rowOf(page, "CDE-42");
	await expect(row).toBeVisible();
	await row.click();
	await expect(peekOf(page, "CDE-42").locator(".markdown")).toBeVisible();
	const opened = await marks(page);
	expect(opened.clickAt).toBeGreaterThan(0);
	expect(opened.summaryAt - opened.clickAt).toBeLessThanOrEqual(50);
	expect(opened.bodyAt - opened.clickAt).toBeLessThanOrEqual(100);
	for (let step = 0; step < 2; step++) {
		const before = (await marks(page)).names.length;
		await page.keyboard.press("j");
		await expect.poll(async () => (await marks(page)).names.length).toBe(before + 1);
		const after = await marks(page);
		const shown = after.names[after.names.length - 1]!;
		await expect(peekOf(page, shown.name)).toBeVisible();
		expect(shown.at - after.keyAt).toBeLessThanOrEqual(50);
	}
});
