import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "./fixture/node_modules/playwright/index.mjs";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
await mkdir(`${root}/assets`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const theme of ["light", "dark"]) {
	for (const width of [320, 390, 1280, 160]) {
		const ctx = await browser.newContext({
			viewport: { width, height: 720 },
			colorScheme: theme,
			reducedMotion: "reduce",
			hasTouch: width < 400,
		});
		const page = await ctx.newPage();
		const errors = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto(`http://127.0.0.1:4197/?theme=${theme}&long=${width === 160}`, { waitUntil: "networkidle" });
		await page.getByText("Connect a device", { exact: true }).waitFor();
		const id = `${theme}-${width}`;
		await page.screenshot({ path: `${root}/assets/no-host-${id}.png`, fullPage: true });
		const record = {
			id,
			theme,
			width,
			date: new Date().toISOString(),
			text: await page.locator("body").innerText(),
			errors,
			controls: await page.getByRole("button").evaluateAll((els) =>
				els.map((e) => ({
					text: e.textContent,
					rect: e.getBoundingClientRect().toJSON(),
					disabled: e.getAttribute("aria-disabled"),
				})),
			),
			overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
		};
		if (width === 320) {
			await page.keyboard.press("Tab");
			await page.waitForTimeout(250);
			record.focus = await page.evaluate(() => ({
				text: document.activeElement?.textContent,
				outline: getComputedStyle(document.activeElement).outline,
				shadow: getComputedStyle(document.activeElement).boxShadow,
			}));
			await page.screenshot({ path: `${root}/assets/no-host-${id}-focus.png`, fullPage: true });
			await page.getByRole("button", { name: "Check again", exact: true }).click();
			await page.getByRole("button", { name: "Checking…", exact: true }).waitFor();
			await page.screenshot({ path: `${root}/assets/no-host-${id}-checking.png`, fullPage: true });
			record.checkingDisabled = await page
				.getByRole("button", { name: "Checking…", exact: true })
				.getAttribute("aria-disabled");
			await page.evaluate(() => globalThis.__completeHostCheck(undefined));
			await page.getByRole("button", { name: "Check again", exact: true }).waitFor();
			record.refetchReturns = true;
			await page.getByRole("button", { name: "Read the setup guide", exact: true }).click();
			record.guideTarget = await page.evaluate(() => globalThis.__fixtureNavigation);
		}
		if (width === 160) {
			await page.getByRole("button", { name: "Read the setup guide", exact: true }).scrollIntoViewIfNeeded();
			await page.screenshot({ path: `${root}/assets/no-host-${id}-bottom.png`, fullPage: true });
		}
		results.push(record);
		console.log(JSON.stringify(record));
		await ctx.close();
	}
}
await writeFile(
	`${root}/fixture-results.json`,
	`${JSON.stringify(
		{
			source: "9a50076c324b3d2575762e5bdcba6838061c8be5",
			scope: "Official no-host component body on React Native Web, not the native app",
			results,
		},
		null,
		2,
	)}\n`,
);
await browser.close();
