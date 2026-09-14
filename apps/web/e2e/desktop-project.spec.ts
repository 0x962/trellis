import { expect, test } from "@playwright/test";
import type { Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("desktop project creation selects local execution and preserves existing projects", async ({ page }) => {
	const existing = await post<Project>("/projects", { key: "OLDX", name: "Existing browser project" });
	await page.addInitScript(() => Object.defineProperty(window, "trellisDesktop", { value: { platform: "darwin" } }));
	await signIn(page, "/setup?step=project");
	await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Native creation");
	await page.getByRole("textbox", { name: "Key", exact: true }).fill("NEWX");
	await page.getByRole("button", { name: /^Create/ }).click();
	await expect.poll(async () => (await get<Project>("/projects/NEWX")).managerConfig?.ade).toBe("native");
	expect((await get<Project>("/projects/OLDX")).managerConfig).toEqual(existing.managerConfig);
	await page.getByRole("button", { name: "Actions for Native creation", exact: true }).click();
	await page.getByRole("menuitem", { name: "New sub-project", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "New sub-project under Native creation", exact: true });
	await sheet.getByRole("textbox", { name: "Project name", exact: true }).fill("Child work");
	await sheet.getByRole("textbox", { name: "Slug", exact: true }).fill("child");
	await sheet.getByRole("button", { name: "Create sub-project", exact: true }).click();
	await expect.poll(async () => (await get<Project>("/projects/NEWX.child")).managerConfig?.ade).toBe("native");
});

test("browser project creation keeps its existing execution defaults", async ({ page }) => {
	await signIn(page, "/setup?step=project");
	await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Browser creation");
	await page.getByRole("textbox", { name: "Key", exact: true }).fill("WEBX");
	await page.getByRole("button", { name: /^Create/ }).click();
	await expect(page).toHaveURL(/\/p\/WEBX$/);
	expect((await get<Project>("/projects/WEBX")).managerConfig?.ade).toBe("superset");
});
