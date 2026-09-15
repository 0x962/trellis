import { expect, test } from "@playwright/test";
import type { Project, Ticket } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("native execution settings and ticket work tabs retain the ticket context", async ({ page }) => {
	await post("/projects", { key: "DUX", name: "Desktop workspace" });
	await post("/tickets", { project: "DUX", title: "Verify local output" });
	await signIn(page, "/p/DUX/settings/manager#settings");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-directory-one");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.directory)
		.toBe("/tmp/trellis-directory-one");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-directory-two");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.directory)
		.toBe("/tmp/trellis-directory-two");
	await page.getByRole("link", { name: "Operation", exact: true }).click();
	await page.getByRole("switch", { name: "Automatic dispatch", exact: true }).uncheck();
	await expect.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.dispatchPaused).toBe(true);
	await page.goto("/t/DUX-1");
	await expect(page.getByRole("tab", { name: "Agent", exact: true })).toBeVisible();
	await page.getByRole("tab", { name: "Checks", exact: true }).click();
	await expect(page.getByText("No pull request checks", { exact: true })).toBeVisible();
	await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Verify local output");
	await page.getByRole("tab", { name: "Activity", exact: true }).click();
	await expect(page.getByRole("tab", { name: "Activity", exact: true })).toHaveAttribute("aria-selected", "true");
	await page.getByRole("tab", { name: "Agent", exact: true }).click();
	await expect(page.getByText("No assigned agent", { exact: true })).toBeVisible();
});

for (const viewport of [
	{ width: 900, height: 650 },
	{ width: 1280, height: 800 },
	{ width: 1600, height: 1000 },
]) {
	test(`ticket work tabs fit a ${viewport.width} by ${viewport.height} window`, async ({ page }) => {
		const key = `DV${viewport.width}`;
		await post("/projects", { key, name: `Desktop window ${viewport.width}` });
		const ticket = await post<Ticket>("/tickets", {
			project: key,
			title: "Inspect a long ticket title with the work area and properties visible",
		});
		await page.setViewportSize(viewport);
		await signIn(page, `/t/${ticket.identifier}`);
		const tab = page.getByRole("tab", { name: "Activity", exact: true });
		await expect(tab).toBeVisible();
		const area = await page.getByRole("region", { name: "Ticket work area", exact: true }).boundingBox();
		const bounds = await tab.boundingBox();
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(area!.x + area!.width);
		await tab.click();
		await expect(
			page
				.getByRole("tabpanel", { name: "Activity", exact: true })
				.getByRole("textbox", { name: "Comment", exact: true }),
		).toBeVisible();
	});
}
