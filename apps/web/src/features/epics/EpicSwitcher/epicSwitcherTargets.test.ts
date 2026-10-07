import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Browser, chromium } from "playwright";

describe.skipIf(process.env.STORYBOOK_URL === undefined)("EpicSwitcher rendered targets", () => {
	let browser: Browser;

	beforeAll(async () => {
		browser = await chromium.launch({
			executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
			headless: true,
			args: process.env.PLAYWRIGHT_DEBUG_PORT ? [`--remote-debugging-port=${process.env.PLAYWRIGHT_DEBUG_PORT}`] : [],
		});
	});

	afterAll(async () => {
		await browser.close();
	});

	for (const theme of ["dark", "light"]) {
		for (const width of [320, 1440]) {
			for (const hasTouch of [false, true]) {
				test(`${theme} at ${width} pixels with ${hasTouch ? "coarse" : "fine"} pointer`, async () => {
					const context = await browser.newContext({
						viewport: { width, height: 900 },
						hasTouch,
						reducedMotion: "reduce",
					});
					const page = await context.newPage();
					await page.goto(
						`${process.env.STORYBOOK_URL}/iframe.html?id=overlays-epicactions--switcher-closed&viewMode=story&globals=theme:${theme}`,
						{ waitUntil: "domcontentloaded" },
					);
					const trigger = page.getByRole("button", { name: "Component catalog", exact: true });
					await trigger.focus();
					await trigger.press("Enter");
					await page.getByRole("option", { name: "All epics", exact: true }).waitFor();
					const geometry = await page
						.getByRole("option")
						.evaluateAll((options) =>
							options.map((option) => ({
								width: option.getBoundingClientRect().width,
								height: option.getBoundingClientRect().height,
							})),
						);
					expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(hasTouch);
					expect(geometry.length).toBe(2);
					for (const option of geometry) {
						expect(option.width).toBeGreaterThanOrEqual(44);
						if (hasTouch) expect(option.height).toBeGreaterThanOrEqual(44);
						else expect(option.height).toBe(28);
					}
					await page.keyboard.press("Escape");
					await page.waitForFunction(() => document.activeElement?.hasAttribute("data-epic-switcher"));
					expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
					await context.close();
				}, 45000);
			}
		}
	}
});
