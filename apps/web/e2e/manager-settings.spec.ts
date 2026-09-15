import { expect, test } from "@playwright/test";
import { HARNESS_PRESETS, type Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("local manager settings preserve directory trust and harness commands", async ({ page }) => {
	await post("/projects", {
		key: "HAR",
		name: "Harness settings",
		managerConfig: { personaId: null, concurrency: 3, directory: "", ade: "native", trustedDirectory: false },
	});
	await page.addInitScript(() =>
		Object.defineProperty(window, "trellisDesktop", {
			value: { platform: "darwin", chooseDirectory: async () => "/tmp/trellis-native-settings" },
		}),
	);
	await signIn(page, "/p/HAR/settings/manager#settings");
	await expect(page.getByText("Trellis runs agents locally in this repository.", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Choose project directory", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Project directory", exact: true })).toHaveValue(
		"/tmp/trellis-native-settings",
	);
	await page.getByRole("checkbox", { name: "Trust this repository", exact: true }).check();
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.trustedDirectory).toBe(true);
	await page.getByRole("link", { name: "Harness", exact: true }).click();
	await page.getByRole("combobox", { name: "Harness preset" }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveValue(
		HARNESS_PRESETS.codex.startCommand,
	);
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.preset).toBe("codex");
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveValue(
		HARNESS_PRESETS.codex.startCommand,
	);
	await page.getByRole("link", { name: "General", exact: true }).click();
	await expect(page.getByRole("checkbox", { name: "Trust this repository", exact: true })).toBeChecked();
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-native-other");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.trustedDirectory).toBe(false);
	await page.getByLabel("Concurrency", { exact: true }).fill("5");
	await page.getByLabel("Concurrency", { exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.concurrency).toBe(5);
});

test("project tool permissions default to allow and save an explicit choice", async ({ page }) => {
	await post("/projects", { key: "PER", name: "Project permissions" });
	await signIn(page, "/p/PER/settings/manager#settings");
	const permissions = page.getByRole("checkbox", { name: "Allow all permissions", exact: true });
	await expect(permissions).toBeChecked();
	await permissions.uncheck();
	await expect.poll(async () => (await get<Project>("/projects/PER")).managerConfig?.allowAllPermissions).toBe(false);
	await page.reload();
	await expect(permissions).not.toBeChecked();
	await permissions.check();
	await expect.poll(async () => (await get<Project>("/projects/PER")).managerConfig?.allowAllPermissions).toBe(true);
	await page.reload();
	await expect(permissions).toBeChecked();
});
