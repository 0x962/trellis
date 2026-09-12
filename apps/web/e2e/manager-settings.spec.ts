import { expect, test } from "@playwright/test";
import { HARNESS_PRESETS, type Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("ADE and harness presets save independently on separate pages", async ({ page }) => {
	await post("/projects", { key: "HAR", name: "Harness settings" });
	await signIn(page, "/p/HAR/settings/manager#harness");
	await expect(page.getByRole("region", { name: "Harness", exact: true })).toBeVisible();
	await expect(page.getByRole("combobox", { name: "ADE preset" })).toBeHidden();
	await page.getByRole("combobox", { name: "Harness preset" }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveValue(
		HARNESS_PRESETS.codex.startCommand,
	);
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.preset).toBe("codex");
	await page.getByRole("link", { name: "ADE", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Healthcheck command" })).toBeHidden();
	await page.getByRole("combobox", { name: "ADE preset" }).click();
	await page.getByRole("option", { name: "tmux", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "Superset host" })).toBeHidden();
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.ade).toBe("tmux");
	await page.getByText("Advanced commands", { exact: false }).click();
	await page.getByText("Healthcheck", { exact: true }).click();
	const health = page.getByRole("textbox", { name: "Healthcheck command" });
	await health.fill("printf '{{unknown}}'");
	await health.press("Tab");
	await expect(page.getByRole("alert")).toContainText("unknown template variable");
	await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
	await health.fill("printf '%s' '{\"state\":\"running\"}'");
	await health.press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.adeCommands?.healthcheck)
		.toBe("printf '%s' '{\"state\":\"running\"}'");
	await page.getByRole("link", { name: "Harness", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "Harness preset" })).toHaveText("Codex");
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveValue(
		HARNESS_PRESETS.codex.startCommand,
	);
	await page.getByRole("link", { name: "General", exact: true }).click();
	await page.getByRole("spinbutton", { name: "Concurrency" }).fill("5");
	await page.getByRole("spinbutton", { name: "Concurrency" }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.concurrency).toBe(5);
});
