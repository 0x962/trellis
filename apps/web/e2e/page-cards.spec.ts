import { expect, test } from "@playwright/test";
import type { Flow } from "@trellis/api";
import { post } from "./api";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

let flow: Flow;

test.beforeAll(async () => {
	if (ensureProject("LAY", "Page layout")) createTicket("LAY", "Read the ticket page");
	flow = await post<Flow>("/flows", { name: "Page layout flow" });
});

const routes = [
	"/needs-you",
	"/all",
	"/all/table",
	"/p/LAY",
	"/p/LAY/table",
	"/p/LAY/settings",
	"/p/LAY/settings/manager",
	"/search",
	"/settings",
	"/ai/personas",
	"/ai/flows",
	"/t/LAY-1",
	"/t/LAY-999",
];

for (const width of [1280, 390]) {
	for (const route of [...routes, "flow-editor"]) {
		test(`${route} keeps unframed panels inside the ${width} px viewport`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 844 });
			await signIn(page, route === "flow-editor" ? `/ai/flows/${flow.slug}` : route);
			if (route === "flow-editor") await expect(page.getByRole("region", { name: "Flow canvas" })).toBeVisible();
			const cards = page.getByRole("main").locator(".page-card");
			await expect(cards).toHaveCount(
				route === "/p/LAY/settings/manager" ? 0 : route === "/t/LAY-1" && width >= 768 ? 2 : 1,
			);
			for (const card of await cards.all()) {
				await expect(card).toBeVisible();
				const bounds = await card.evaluate((element) => {
					const box = element.getBoundingClientRect();
					const style = getComputedStyle(element);
					return {
						left: box.left,
						top: box.top,
						right: innerWidth - box.right,
						bottom: innerHeight - box.bottom,
						borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth].map(Number.parseFloat),
						radii: [
							style.borderTopLeftRadius,
							style.borderTopRightRadius,
							style.borderBottomLeftRadius,
							style.borderBottomRightRadius,
						].map(Number.parseFloat),
					};
				});
				expect(bounds.left).toBeGreaterThanOrEqual(0);
				expect(bounds.top).toBeGreaterThanOrEqual(0);
				expect(bounds.right).toBeGreaterThanOrEqual(0);
				expect(bounds.bottom).toBeGreaterThanOrEqual(0);
				for (const radius of bounds.radii) expect(radius).toBe(0);
				for (const border of bounds.borders) expect(border).toBe(0);
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
			await page.screenshot({ path: testInfo.outputPath("page.png") });
		});
	}
}
