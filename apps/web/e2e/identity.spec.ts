import { expect, test } from "@playwright/test";
import { get } from "./api";

type DefaultActor = { name: string; kind: string; stored: boolean };

// onboarding.spec.ts ran the setup once, so the server holds the name. A
// browser context with nothing in localStorage reads it and skips setup.
test("a second browser context opens the app with no setup", async ({ browser }, testInfo) => {
	const identity = await get<DefaultActor>("/actors/default");
	expect(identity.stored).toBe(true);
	const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
	const page = await context.newPage();
	const visited: string[] = [];
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) visited.push(frame.url());
	});
	await page.goto("/");
	await expect(page).toHaveURL(/\/needs-you$/);
	await expect(page.getByRole("heading", { name: /Needs you/ })).toBeVisible();
	await expect(page.getByRole("complementary", { name: "Sidebar" })).toContainText(identity.name);
	expect(visited.filter((url) => url.includes("/setup"))).toEqual([]);
	const actor = await page.evaluate(() => localStorage.getItem("trellis.actor"));
	expect(JSON.parse(actor!)).toEqual({ name: identity.name, kind: "human" });
	await context.close();
});
