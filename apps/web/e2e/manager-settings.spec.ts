import { expect, test } from "@playwright/test";
import { type AgentRun, HARNESS_PRESETS, type Persona, type Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("local manager settings preserve directory trust, model, and custom commands", async ({ page }) => {
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
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveCount(0);
	await page.getByRole("textbox", { name: "Model", exact: true }).fill("gpt-5.6-sol");
	await page.getByRole("textbox", { name: "Model", exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.model).toBe("gpt-5.6-sol");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.preset).toBe("codex");
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Model", exact: true })).toHaveValue("gpt-5.6-sol");
	await page.getByRole("combobox", { name: "Harness preset" }).click();
	await page.getByRole("option", { name: "Custom", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveValue(
		HARNESS_PRESETS.codex.startCommand,
	);
	await page.getByRole("textbox", { name: "Start command", exact: true }).fill("custom-agent {{prompt}}");
	await page.getByRole("textbox", { name: "Start command", exact: true }).press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.startCommand)
		.toBe("custom-agent {{prompt}}");
	await page.getByRole("link", { name: "General", exact: true }).click();
	await expect(page.getByRole("checkbox", { name: "Trust this repository", exact: true })).toBeChecked();
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-native-other");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.trustedDirectory).toBe(false);
	await page.getByLabel("Concurrency", { exact: true }).fill("5");
	await page.getByLabel("Concurrency", { exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.concurrency).toBe(5);
});

test("a blank default model remains valid after an edit", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Model default fixture",
		kind: "manager",
		instruction: "Wait.",
	});
	await post("/projects", {
		key: "MDF",
		name: "Model default",
		managerConfig: {
			personaId: persona.id,
			concurrency: 1,
			directory: "/tmp",
			trustedDirectory: true,
		},
	});
	await signIn(page, "/p/MDF/settings/manager#harness");
	const start = page.getByRole("button", { name: "Start manager", exact: true });
	await expect(start).toBeEnabled();
	const model = page.getByRole("textbox", { name: "Model", exact: true });
	await model.fill(" ");
	await model.press("Tab");
	await expect(model).toHaveValue("");
	await expect(start).toBeEnabled();
	expect((await get<Project>("/projects/MDF")).managerConfig?.harness.model).toBeUndefined();
});

test("a manager without a launched process can start after its settings are fixed", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Trust fixture",
		kind: "manager",
		instruction: "Wait.",
	});
	await post("/projects", {
		key: "MTR",
		name: "Manager trust",
		managerConfig: {
			personaId: persona.id,
			concurrency: 1,
			directory: "/tmp",
			trustedDirectory: false,
		},
	});
	await signIn(page, "/p/MTR/settings/manager");
	await page.getByRole("button", { name: "Start manager", exact: true }).click();
	await expect
		.poll(async () => (await get<AgentRun[]>("/agent-runs?project=MTR"))[0]?.error)
		.toContain("Trust this repository");
	expect((await get<AgentRun[]>("/agent-runs?project=MTR"))[0]?.processStatus).toBeNull();
	await page.getByRole("link", { name: "General", exact: true }).click();
	await page.getByRole("checkbox", { name: "Trust this repository", exact: true }).check();
	await expect.poll(async () => (await get<Project>("/projects/MTR")).managerConfig?.trustedDirectory).toBe(true);
	await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeEnabled();
	await expect(page.getByRole("button", { name: "Stop manager", exact: true })).toHaveCount(0);
});
