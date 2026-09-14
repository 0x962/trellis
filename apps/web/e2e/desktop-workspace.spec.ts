import { expect, test } from "@playwright/test";
import type { Project, Ticket } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("native execution settings and ticket work tabs retain the ticket context", async ({ page }) => {
	await post("/projects", { key: "DUX", name: "Desktop workspace" });
	await post("/tickets", { project: "DUX", title: "Verify local output" });
	await signIn(page, "/p/DUX/settings/manager#ade");
	await page.getByRole("combobox", { name: "ADE preset" }).click();
	await page.getByRole("option", { name: "Trellis (local)", exact: true }).click();
	await expect.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.ade).toBe("native");
	await expect(page.getByText("Trellis owns the terminal and workspace on this Mac.", { exact: true })).toBeVisible();
	await expect(page.getByText("Advanced commands", { exact: false })).toBeHidden();
	await page.getByRole("link", { name: "General", exact: true }).click();
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-trust-one");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await page.getByRole("checkbox", { name: "Trust this repository", exact: true }).check();
	await expect.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.trustedDirectory).toBe(true);
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-trust-two");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.trustedDirectory).toBe(false);
	await page.getByRole("link", { name: "Operation", exact: true }).click();
	await page.getByRole("switch", { name: "Automatic dispatch", exact: true }).uncheck();
	await expect.poll(async () => (await get<Project>("/projects/DUX")).managerConfig?.dispatchPaused).toBe(true);
	await page.goto("/t/DUX-1");
	await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
	await page.getByRole("tab", { name: "Checks", exact: true }).click();
	await expect(page.getByText("No checks reported", { exact: true })).toBeVisible();
	await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Verify local output");
	await page.getByRole("tab", { name: "Activity", exact: true }).click();
	await expect(page.getByRole("tab", { name: "Activity", exact: true })).toHaveAttribute("aria-selected", "true");
	await page.getByRole("tab", { name: "Overview", exact: true }).click();
	await expect(page.getByText("No execution attempts", { exact: true })).toBeVisible();
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
