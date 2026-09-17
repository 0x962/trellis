import { expect, test } from "@playwright/test";
import { type AgentRun, HARNESS_PRESETS, type Persona, type Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("local manager settings save directories without approval and preserve model and custom commands", async ({
	page,
}) => {
	const persona = await post<Persona>("/personas", {
		name: "Settings manager",
		kind: "manager",
		instruction: "Wait.",
	});
	await post("/projects", {
		key: "HAR",
		name: "Harness settings",
		managerConfig: { personaId: null, directory: "", ade: "native" },
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
	await expect(page.getByRole("checkbox", { name: "Trust this repository", exact: true })).toHaveCount(0);
	await expect
		.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.directory)
		.toBe("/tmp/trellis-native-settings");
	await navigation.getByRole("link", { name: "Harness", exact: true }).click();
	await expect(page).toHaveURL(/\/p\/HAR\/settings#harness$/);
	await expect(
		page.getByText("A resume keeps its saved model unless you select another model for that resume."),
	).toBeVisible();
	await page.getByRole("combobox", { name: "Harness preset" }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await expect(
		page.getByText("A resume keeps its saved model unless you select another model for that resume."),
	).toBeVisible();
	await expect(page.getByRole("textbox", { name: "Start command", exact: true })).toHaveCount(0);
	// The options carry the names the codex stand-in on the PATH of the
	// server listed, and the project stores the canonical model id.
	await page.getByRole("combobox", { name: "Model", exact: true }).click();
	await expect(page.getByRole("option", { name: "Harness default", exact: true })).toBeVisible();
	await page.getByRole("option", { name: "GPT-5.6-Sol", exact: true }).click();
	await expect
		.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.model)
		.toBe("openai/gpt-5.6-sol");
	await expect.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.harness.preset).toBe("codex");
	await page.reload();
	await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveText("GPT-5.6-Sol");
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
	await expect(page.getByRole("checkbox", { name: "Trust this repository", exact: true })).toHaveCount(0);
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-native-other");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/HAR")).managerConfig?.directory)
		.toBe("/tmp/trellis-native-other");
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
	await expect(
		page.getByRole("checkbox", { name: "Trust this repository", exact: true, includeHidden: true }),
	).toHaveCount(0);
	await expect(page.getByRole("switch", { name: "Automatic dispatch", exact: true, includeHidden: true })).toHaveCount(
		0,
	);
});

test("the harness default stays valid after a model is chosen and cleared", async ({ page }) => {
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
			directory: "/tmp",
			dispatchPaused: true,
		},
	});
	await signIn(page, "/p/MDF/settings#harness");
	const start = page.getByRole("button", { name: "Start manager", exact: true });
	const model = page.getByRole("combobox", { name: "Model", exact: true });
	await expect(page.getByRole("textbox", { name: "Model", exact: true })).toHaveCount(0);
	await model.click();
	const menu = await page.getByRole("listbox").boundingBox();
	expect(menu!.y).toBeGreaterThanOrEqual(0);
	await page.getByRole("option", { name: "Sonnet", exact: true }).click();
	await expect
		.poll(async () => (await get<Project>("/projects/MDF")).managerConfig?.harness.model)
		.toBe("anthropic/claude-sonnet-5");
	await model.click();
	await page.getByRole("option", { name: "Harness default", exact: true }).click();
	await expect(model).toHaveText("Harness default");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("All changes saved");
	expect((await get<Project>("/projects/MDF")).managerConfig?.harness.model).toBeUndefined();
	await page.goto("/p/MDF/settings/manager");
	await expect(start).toBeEnabled();
});

test("manager and harness settings retain one unsaved draft", async ({ page }) => {
	await post("/projects", {
		key: "MSD",
		name: "Shared manager draft",
		managerConfig: { personaId: null, directory: "/tmp", dispatchPaused: true },
	});
	await signIn(page, "/p/MSD/settings#manager");
	const navigation = page.getByRole("navigation", { name: "Project settings", exact: true });
	const directory = page.getByRole("textbox", { name: "Project directory", exact: true });
	await directory.fill("relative-unsaved-draft");
	await navigation.getByRole("link", { name: "Harness", exact: true }).click();
	await page.getByRole("combobox", { name: "Harness preset", exact: true }).click();
	await page.getByRole("option", { name: "Custom", exact: true }).click();
	await page.getByRole("textbox", { name: "Start command", exact: true }).fill("draft-agent {{prompt}}");
	await page.getByRole("textbox", { name: "Start command", exact: true }).press("Tab");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("Unsaved changes");
	expect((await get<Project>("/projects/MSD")).managerConfig?.harness.preset).toBe("claude");
	await navigation.getByRole("link", { name: "Manager", exact: true }).click();
	await expect(directory).toHaveValue("relative-unsaved-draft");
	await directory.fill("/tmp/shared-draft");
	await directory.press("Tab");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("All changes saved");
	const project = await get<Project>("/projects/MSD");
	expect(project.managerConfig?.directory).toBe("/tmp/shared-draft");
	expect(project.managerConfig?.harness.preset).toBe("custom");
	expect(project.managerConfig?.harness.startCommand).toBe("draft-agent {{prompt}}");
});

test("a saved directory lets the manager start without repository approval", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Directory fixture",
		kind: "manager",
		instruction: "Wait.",
	});
	const project = await post<Project>("/projects", {
		key: "MTR",
		name: "Manager directory",
		managerConfig: { personaId: persona.id, directory: "", dispatchPaused: true },
	});
	let started: unknown;
	let run: AgentRun | null = null;
	await page.routeWebSocket("**/api/agent-runs/**", (socket) => socket.close());
	await page.route("**/rpc/agentRuns/list*", (route) => route.fulfill({ json: { json: run ? [run] : [] } }));
	await page.route("**/rpc/agentRuns/start", async (route) => {
		started = route.request().postDataJSON().json;
		run = {
			id: "01K00000000000000000000001",
			name: persona.name,
			runtime: "native",
			personaId: persona.id,
			personaName: persona.name,
			kind: "manager",
			instruction: persona.instruction,
			projectId: project.id,
			projectPath: "MTR",
			ticketId: null,
			ticketIdentifier: null,
			state: "running",
			processStatus: "running",
			observation: null,
			workspaceId: "/tmp/trellis-directory-start",
			terminalId: "directory-attempt",
			url: null,
			error: null,
			sessionId: "directory-session",
			sessionLost: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		await route.fulfill({ json: { json: run } });
	});
	await signIn(page, "/p/MTR/settings#manager");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).fill("/tmp/trellis-directory-start");
	await page.getByRole("textbox", { name: "Project directory", exact: true }).press("Tab");
	await expect
		.poll(async () => (await get<Project>("/projects/MTR")).managerConfig?.directory)
		.toBe("/tmp/trellis-directory-start");
	await expect(page.getByRole("checkbox", { name: "Trust this repository", exact: true })).toHaveCount(0);
	await page.goto("/p/MTR/settings/manager");
	await page.getByRole("button", { name: "Start manager", exact: true }).click();
	await expect.poll(() => started).toEqual({ project: "MTR", personaId: persona.id, newSession: false });
	await expect(page.getByRole("button", { name: "Stop manager", exact: true })).toBeEnabled();
});

test("a sub-project confirms its own manager and the parent manager gets one event", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Sub-project manager",
		kind: "manager",
		instruction: "Wait.",
	});
	const parent = await post<Project>("/projects", {
		key: "SPM",
		name: "Sub-project manager parent",
		managerConfig: { personaId: persona.id, directory: "/tmp", dispatchPaused: true },
	});
	const child = await post<Project>("/projects", { parent: "SPM", name: "Managed child", slug: "child" });
	await signIn(page, "/p/SPM/child/settings#manager");
	const personaPicker = page.getByRole("combobox", { name: "Manager persona", exact: true });
	const dialog = page.getByRole("dialog", { name: "Turn on a manager for this sub-project?" });
	await personaPicker.click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText("The parent manager receives one event about this change.")).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(personaPicker).toContainText("Select a manager persona");
	expect((await get<Project>(`/projects/${child.id}`)).managerConfig?.personaId).toBeNull();
	await personaPicker.click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	await dialog.getByRole("button", { name: "Turn on manager", exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect
		.poll(async () => (await get<Project>(`/projects/${child.id}`)).managerConfig?.personaId)
		.toBe(persona.id);
	await expect(page.getByRole("main").getByRole("status")).toHaveText("All changes saved");
	await expect(personaPicker).toContainText(persona.name);
	await expect
		.poll(async () =>
			(await get<{ events: unknown[] }[]>(`/manager-dispatches?projectId=${parent.id}`)).flatMap((row) => row.events),
		)
		.toEqual([
			expect.objectContaining({
				ticketId: null,
				action: "project.subproject_manager_enabled",
				project: { id: child.id, path: "SPM.child" },
			}),
		]);
	expect(await get<unknown[]>(`/manager-dispatches?projectId=${child.id}`)).toEqual([]);
	await personaPicker.click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	await expect(dialog).toBeHidden();
});

test("a child can clear its directory to use its parent repository", async ({ page }) => {
	await post("/projects", {
		key: "MDP",
		name: "Parent repository",
		managerConfig: { personaId: null, directory: "/tmp/trellis-parent" },
	});
	const child = await post<Project>("/projects", {
		parent: "MDP",
		name: "Child repository",
		slug: "child",
		managerConfig: { personaId: null, directory: "/tmp/trellis-child" },
	});
	await signIn(page, "/p/MDP/child/settings#manager");
	const directory = page.getByRole("textbox", { name: "Project directory", exact: true });
	await directory.fill("");
	await directory.press("Tab");
	await expect.poll(async () => (await get<Project>(`/projects/${child.id}`)).managerConfig?.directory).toBe("");
	await expect(
		page.getByText("Leave blank to use the nearest parent project's repository directory.", { exact: true }),
	).toBeVisible();
	await page.reload();
	await expect(directory).toHaveValue("");
	await page.goto("/p/MDP/settings#manager");
	await expect(
		page.getByText("Leave blank to use the nearest parent project's repository directory.", { exact: true }),
	).toHaveCount(0);
});
