import type { Browser } from "playwright";

export const managerCheck = async (browser: Browser, origin: string) => {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
	const checks: string[] = [];
	const errors: string[] = [];
	try {
		const page = await context.newPage();
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`${origin}/?path=/story/components-button--default`);
		const control = page.getByRole("textbox", { name: "Edit children as JSON" });
		await control.fill('"Catalog preview"');
		await control.press("Tab");
		const frame = page.frameLocator("#storybook-preview-iframe");
		await frame.getByRole("button", { name: "Catalog preview", exact: true }).waitFor();
		checks.push("Controls updates the rendered component.");
		await page.goto(`${origin}/?path=/story/pages-navigation--renamed-actor`);
		await frame.getByRole("button", { name: /Catalog reviewer/ }).waitFor();
		await page.getByRole("link", { name: "Expanded", exact: true }).click();
		await frame.getByRole("button", { name: /^Storybook/ }).waitFor();
		checks.push("A story change restores the synthetic actor.");
		await page.goto(`${origin}/?path=/story/components-button--default`);
		await page.getByRole("button", { name: /^Application theme/ }).click();
		await page.getByRole("option", { name: "light", exact: true }).click();
		await frame.locator('html[data-theme="light"]').waitFor({ state: "attached" });
		checks.push("The theme toolbar applies the light theme.");
		await page.getByRole("button", { name: /^Viewport size/ }).click();
		await page.getByRole("option", { name: "Narrow phone", exact: true }).click();
		await page.waitForFunction(() => document.getElementById("storybook-preview-iframe")!.clientWidth === 320);
		checks.push("The viewport toolbar sets a 320 pixel canvas.");
		await page.goto(`${origin}/?path=/docs/components-button--docs`);
		await frame.getByRole("heading", { name: "Button", exact: true }).waitFor();
		await frame.getByRole("button", { name: "Save", exact: true }).waitFor();
		checks.push("The documentation page renders its component and controls.");
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	} finally {
		await context.close();
	}
	return { checks, errors };
};
