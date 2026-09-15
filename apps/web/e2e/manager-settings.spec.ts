import { expect, test } from "@playwright/test";
import { type AgentRun, HARNESS_PRESETS, type Persona, type Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("local manager settings preserve directory trust, model, and custom commands", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Settings manager",
		kind: "manager",
		instruction: "Wait.",
	});
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
	await signIn(page, "/p/HAR/settings#manager");
	const navigation = page.getByRole("navigation", { name: "Project settings", exact: true });
	await expect(navigation.getByRole("link", { name: "Manager", exact: true })).toHaveAttribute("aria-current", "page");
	await expect(page.getByRole("button", { name: /^(Start|Stop|Resume) manager$/ })).toHaveCount(0);
	await page.getByRole("combobox", { name: "Manager persona", exact: true }).click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.personaId).toBe(persona.id);
	await expect(page.getByRole("switch", { name: "Automatic dispatch", exact: true })).toBeChecked();
	await page.getByRole("switch", { name: "Automatic dispatch", exact: true }).uncheck();
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.dispatchPaused).toBe(true);
	await expect(page.getByRole("region", { name: "Repositories", exact: true, includeHidden: true })).toHaveCount(1);
	await expect(page.getByText("Trellis runs agents locally in this repository.", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Choose project directory", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Project directory", exact: true })).toHaveValue(
		"/tmp/trellis-native-settings",
	);
	await page.getByRole("checkbox", { name: "Trust this repository", exact: true }).check();
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.trustedDirectory).toBe(true);
	await navigation.getByRole("link", { name: "Harness", exact: true }).click();
	await expect(page).toHaveURL(/\/p\/HAR\/settings#harness$/);
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
	await navigation.getByRole("link", { name: "Manager", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "Manager persona", exact: true })).toContainText(persona.name);
	await expect(page.getByRole("switch", { name: "Automatic dispatch", exact: true })).not.toBeChecked();
	await expect(page.getByRole("checkbox", { name: "Trust this repository", exact: true })).toBeChecked();
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-native-other");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.trustedDirectory).toBe(false);
	await page.getByLabel("Concurrency", { exact: true }).fill("5");
	await page.getByLabel("Concurrency", { exact: true }).press("Tab");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.concurrency).toBe(5);
	await expect(page.getByRole("main").getByRole("status")).toHaveText("All changes saved");
	await navigation.getByRole("link", { name: "Harness", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveValue(
		"custom-agent {{prompt}}",
	);
	await page.getByRole("textbox", { name: "Resume command", exact: true }).fill("custom-agent resume {{resumeText}}");
	await page.getByRole("textbox", { name: "Resume command", exact: true }).press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.resumeCommand)
		.toBe("custom-agent resume {{resumeText}}");
	await page.goto("/p/HAR/settings/manager");
	await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Manager navigation", exact: true })).toHaveCount(0);
	await expect(page.getByRole("combobox", { name: /Manager persona|Harness preset/, includeHidden: true })).toHaveCount(
		0,
	);
	await expect(
		page.getByRole("textbox", { name: /Project directory|Model|Start command|Resume command/, includeHidden: true }),
	).toHaveCount(0);
	await expect(page.getByLabel("Concurrency", { exact: true })).toHaveCount(0);
	await expect(
		page.getByRole("checkbox", { name: "Trust this repository", exact: true, includeHidden: true }),
	).toHaveCount(0);
	await expect(page.getByRole("switch", { name: "Automatic dispatch", exact: true, includeHidden: true })).toHaveCount(
		0,
	);
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
			dispatchPaused: true,
		},
	});
	await signIn(page, "/p/MDF/settings#harness");
	const model = page.getByRole("textbox", { name: "Model", exact: true });
	await model.fill(" ");
	await model.press("Tab");
	await expect(model).toHaveValue("");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("All changes saved");
	expect((await get<Project>("/projects/MDF")).managerConfig?.harness.model).toBeUndefined();
	await page.goto("/p/MDF/settings/manager");
	await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeEnabled();
});

test("manager and harness settings retain one unsaved draft", async ({ page }) => {
	await post("/projects", {
		key: "MSD",
		name: "Shared manager draft",
		managerConfig: { personaId: null, concurrency: 3, directory: "/tmp", dispatchPaused: true },
	});
	await signIn(page, "/p/MSD/settings#manager");
	const navigation = page.getByRole("navigation", { name: "Project settings", exact: true });
	await page.getByLabel("Concurrency", { exact: true }).fill("0");
	await navigation.getByRole("link", { name: "Harness", exact: true }).click();
	await page.getByRole("textbox", { name: "Model", exact: true }).fill("draft-model");
	await page.getByRole("textbox", { name: "Model", exact: true }).press("Tab");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("Unsaved changes");
	expect((await get<Project>("/projects/MSD")).managerConfig?.harness.model).toBeUndefined();
	await navigation.getByRole("link", { name: "Manager", exact: true }).click();
	await expect(page.getByLabel("Concurrency", { exact: true })).toHaveValue("");
	await page.getByLabel("Concurrency", { exact: true }).fill("2");
	await page.getByLabel("Concurrency", { exact: true }).press("Tab");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("All changes saved");
	const project = await get<Project>("/projects/MSD");
	expect(project.managerConfig?.concurrency).toBe(2);
	expect(project.managerConfig?.harness.model).toBe("draft-model");
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
			dispatchPaused: true,
		},
	});
	await signIn(page, "/p/MTR/settings/manager");
	await page.getByRole("button", { name: "Start manager", exact: true }).click();
	await expect
		.poll(async () => (await get<AgentRun[]>("/agent-runs?project=MTR"))[0]?.error)
		.toContain("Trust this repository");
	expect((await get<AgentRun[]>("/agent-runs?project=MTR"))[0]?.processStatus).toBeNull();
	await page.goto("/p/MTR/settings#manager");
	await page.getByRole("checkbox", { name: "Trust this repository", exact: true }).check();
	await expect.poll(async () => (await get<Project>("/projects/MTR")).managerConfig?.trustedDirectory).toBe(true);
	await page.goto("/p/MTR/settings/manager");
	await expect(page.getByRole("button", { name: "Start manager", exact: true })).toBeEnabled();
	await expect(page.getByRole("button", { name: "Stop manager", exact: true })).toHaveCount(0);
});
