import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { apiUrl } from "./env";
import { signIn } from "./support";

const web = fileURLToPath(new URL("..", import.meta.url));

// The budgets hold for the production build, so this spec builds the web
// app into the temp root and opens it from the server, which serves that
// directory (TRELLIS_WEB_DIST in playwright.config.ts). Thirty tickets fill
// the first screen of the table.
test.beforeAll(() => {
	test.setTimeout(120_000);
	const dist = join(process.env.TRELLIS_E2E_ROOT!, "dist");
	execFileSync("bun", ["run", "build", "--outDir", dist, "--emptyOutDir"], { cwd: web, stdio: "ignore" });
	if (!ensureProject("PNT", "Paint")) return;
	for (let number = 1; number <= 30; number++) createTicket("PNT", `Paint the table row ${number}`);
});

// The init script runs before the document parses. Its first animation
// frame callback runs before the first paint of the page, so it sees the
// theme the first frame paints with. The row stamp is the frame after the
// first table row enters the DOM: the frame that paints it.
const probe = `(() => {
	const marks = { frameTheme: null, paintedBeforeFrame: true, rowsAt: 0 };
	window.__paint = marks;
	requestAnimationFrame(() => {
		marks.frameTheme = document.documentElement.getAttribute("data-theme");
		marks.paintedBeforeFrame = performance.getEntriesByType("paint").length > 0;
	});
	const observer = new MutationObserver(() => {
		if (document.querySelector('[role="row"][data-identifier]') === null) return;
		observer.disconnect();
		requestAnimationFrame(() => { marks.rowsAt = performance.now(); });
	});
	observer.observe(document, { subtree: true, childList: true });
})();`;

type Marks = { frameTheme: string | null; paintedBeforeFrame: boolean; rowsAt: number; fcp: number };

// Opens the table from the server and returns the page's own marks. Every
// time is in ms from the start of the navigation.
const load = async (page: Page): Promise<Marks> => {
	await page.goto(`${apiUrl}/p/PNT`);
	await expect(page.locator('[role="row"][data-identifier]').first()).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const marks = (window as unknown as { __paint: { rowsAt: number } }).__paint;
				return marks.rowsAt > 0 && performance.getEntriesByName("first-contentful-paint").length > 0;
			}),
		)
		.toBe(true);
	return page.evaluate(() => ({
		...(window as unknown as { __paint: Omit<Marks, "fcp"> }).__paint,
		fcp: performance.getEntriesByName("first-contentful-paint")[0]!.startTime,
	}));
};

const report = (name: string, ms: number) => {
	test.info().annotations.push({ type: name, description: `${Math.round(ms)} ms` });
	console.log(`paint: ${name} ${Math.round(ms)} ms`);
};

// A fresh profile has no stored theme. The inline head script stamps dark
// before the first frame, and the body paints the dark background token,
// which is --bg of the dark block in packages/ui/src/tokens.css: #070707.
test("paint > the first frame of a fresh profile carries the dark theme", async ({ page }) => {
	await page.addInitScript(probe);
	await signIn(page, "about:blank");
	const marks = await load(page);
	expect(marks.paintedBeforeFrame).toBe(false);
	expect(marks.frameTheme).toBe("dark");
	expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(7, 7, 7)");
});

// Cold: a new browser profile with nothing cached.
test("paint > a cold load paints within 300 ms and shows rows within 600 ms @timing", async ({ page }) => {
	await page.addInitScript(probe);
	await signIn(page, "about:blank");
	const marks = await load(page);
	report("cold first contentful paint", marks.fcp);
	report("cold rows", marks.rowsAt);
	expect(marks.fcp).toBeLessThanOrEqual(300);
	expect(marks.rowsAt).toBeLessThanOrEqual(600);
});

// Warm: the same profile opens the table a second time, with the hashed
// assets in the browser cache.
test("paint > a warm load shows rows within 150 ms @timing", async ({ page }) => {
	await page.addInitScript(probe);
	await signIn(page, "about:blank");
	await load(page);
	const marks = await load(page);
	report("warm first contentful paint", marks.fcp);
	report("warm rows", marks.rowsAt);
	expect(marks.rowsAt).toBeLessThanOrEqual(150);
});
