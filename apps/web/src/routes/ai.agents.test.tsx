import { beforeEach, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../test/fake-server";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

test("ticket assignment requires a persona and creates a named agent", async () => {
	const server = createFakeServer();
	const persona = await server.client.personas.create({
		name: "Feature Builder",
		kind: "builder",
		instruction: "Build the selected ticket.",
	});
	await server.client.personas.create({ name: "Coordinator", kind: "manager", instruction: "Manage." });
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "New agent" }));
	const picker = within(await screen.findByRole("dialog", { name: "Assign a persona" }));
	expect(picker.getByRole("combobox", { name: "Search personas" })).toBeDefined();
	expect(screen.queryByRole("option", { name: "Coordinator" })).toBeNull();
	expect(server.callsTo("agentRuns.start")).toHaveLength(0);
	await user.type(picker.getByRole("combobox", { name: "Search personas" }), "Feature");
	await user.keyboard("{Enter}");
	await waitFor(() => expect(server.callsTo("agentRuns.start")).toHaveLength(1));
	expect(server.callsTo("agentRuns.start")[0]!.input).toEqual({ personaId: persona.id, ticket: "CDE-42" });
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(await screen.findByRole("button", { name: /Ada Finch/ })).toBeDefined();
});

test("the project Manager page saves its setup and starts its configured persona", async () => {
	const server = createFakeServer();
	const manager = await server.client.personas.create({
		name: "Trellis Manager",
		kind: "manager",
		instruction: "Manage the project.",
	});
	const user = userEvent.setup();
	renderApp({ path: "/p/CDE/settings/manager", actor: "navid", server });
	await screen.findByRole("heading", { name: "Superset CDE › Manager" });
	await user.click(screen.getByRole("combobox", { name: "Manager persona" }));
	await user.click(await screen.findByRole("option", { name: "Trellis Manager" }));
	await user.clear(screen.getByRole("spinbutton", { name: "Concurrency" }));
	await user.type(screen.getByRole("spinbutton", { name: "Concurrency" }), "2");
	server.state.directorySelection = "/tmp/project";
	await user.click(screen.getByRole("textbox", { name: "Project directory" }));
	await waitFor(() => expect(server.callsTo("system.chooseDirectory")).toHaveLength(1));
	await waitFor(async () =>
		expect((await server.client.projects.get({ project: "CDE" })).managerConfig).toEqual({
			personaId: manager.id,
			concurrency: 2,
			directory: "/tmp/project",
		}),
	);
	expect(screen.queryByRole("button", { name: "Save manager settings" })).toBeNull();
	expect(screen.queryByText("Edit personas and instructions")).toBeNull();
	expect(screen.queryByText("Workflow")).toBeNull();
	await user.click(
		within(screen.getByRole("navigation", { name: "Manager settings" })).getByRole("link", { name: "Manager" }),
	);
	await user.click(screen.getByRole("button", { name: "Start manager" }));
	await waitFor(() => expect(server.callsTo("agentRuns.start")).toHaveLength(1));
	expect(server.callsTo("agentRuns.start")[0]!.input).toEqual({ personaId: manager.id, project: "CDE" });
	expect(await screen.findByRole("button", { name: /Ada Finch/ })).toBeDefined();
	const navigation = within(screen.getByRole("navigation", { name: "Superset CDE pages" }));
	expect(navigation.getByRole("link", { name: "Manager" }).getAttribute("aria-current")).toBe("page");
	expect(navigation.getByRole("link", { name: "Tickets" }).getAttribute("aria-current")).toBeNull();
});

test("a rejected start retains the selected persona and displays the error", async () => {
	const server = createFakeServer();
	await server.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." });
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "New agent" }));
	const picker = within(await screen.findByRole("dialog", { name: "Assign a persona" }));
	await user.type(picker.getByRole("combobox", { name: "Search personas" }), "Builder");
	server.failNext("agentRuns.start", { code: "DUPLICATE", data: { field: "active agent" } });
	await user.click(await picker.findByRole("option", { name: "Builder" }));
	expect((await picker.findByRole("alert")).textContent).toContain("Could not start the agent");
	expect((picker.getByRole("combobox", { name: "Search personas" }) as HTMLInputElement).value).toBe("Builder");
	expect(picker.getByRole("option", { name: "Builder" })).toBeDefined();
});

test("an agent slideout shows output and sends a follow-up", async () => {
	const server = createFakeServer();
	const persona = await server.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." });
	await server.client.agentRuns.start({ personaId: persona.id, ticket: "CDE-42" });
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: /Ada Finch/ }));
	expect(await screen.findByText("Agent output")).toBeDefined();
	await user.type(screen.getByRole("textbox", { name: "Follow-up" }), "Please fix the failing check.");
	await user.click(screen.getByRole("button", { name: "Send follow-up" }));
	await waitFor(() => expect(server.callsTo("agentRuns.send")).toHaveLength(1));
	expect(server.callsTo("agentRuns.send")[0]!.input).toMatchObject({ text: "Please fix the failing check." });
});

test("a project's Manager page accepts a GitHub URL and keeps a refused setup draft", async () => {
	const server = createFakeServer();
	const user = userEvent.setup();
	renderApp({ path: "/p/TRL/settings/manager#repositories", actor: "navid", server });
	await user.type(await screen.findByRole("textbox", { name: "Repository" }), "https://github.com/0x962/trellis");
	await user.click(screen.getByRole("button", { name: "Add repository" }));
	await waitFor(() => expect(server.callsTo("projects.setRepos")).toHaveLength(1));
	expect(screen.getByRole("link", { name: "0x962/trellis" }).getAttribute("href")).toBe(
		"https://github.com/0x962/trellis",
	);
	await user.click(
		within(screen.getByRole("navigation", { name: "Manager settings" })).getByRole("link", { name: "General" }),
	);
	server.failNext("projects.update", { code: "PROJECT_ARCHIVED" });
	server.state.directorySelection = "/tmp/draft";
	await user.click(screen.getByRole("textbox", { name: "Project directory" }));
	expect((await screen.findByRole("alert")).textContent).toContain("Could not save manager settings");
	expect(screen.getByRole("textbox", { name: "Project directory" })).toHaveProperty("value", "/tmp/draft");
});

test("a canceled folder selection keeps the directory and makes no write", async () => {
	const server = createFakeServer();
	await server.client.projects.update({
		project: "TRL",
		managerConfig: { personaId: null, concurrency: 3, directory: "/tmp/original" },
	});
	const writes = server.callsTo("projects.update").length;
	const user = userEvent.setup();
	renderApp({ path: "/p/TRL/settings/manager", actor: "navid", server });
	const directory = await screen.findByRole("textbox", { name: "Project directory" });
	await user.click(directory);
	await waitFor(() => expect(server.callsTo("system.chooseDirectory")).toHaveLength(1));
	expect(directory).toHaveProperty("value", "/tmp/original");
	expect(server.callsTo("projects.update")).toHaveLength(writes);
});

test("manager autosave preserves a newer edit while a previous save is pending", async () => {
	const server = createFakeServer();
	server.state.directorySelection = "/tmp/project";
	const user = userEvent.setup();
	renderApp({ path: "/p/TRL/settings/manager", actor: "navid", server });
	const concurrency = await screen.findByRole("spinbutton", { name: "Concurrency" });
	const hold = server.holdNext("projects.update");
	await user.clear(concurrency);
	await user.type(concurrency, "2");
	await user.tab();
	await waitFor(() => expect(server.callsTo("projects.update")).toHaveLength(1));
	await user.click(screen.getByRole("textbox", { name: "Project directory" }));
	await waitFor(() =>
		expect(screen.getByRole("textbox", { name: "Project directory" })).toHaveProperty("value", "/tmp/project"),
	);
	hold.release();
	await waitFor(async () =>
		expect((await server.client.projects.get({ project: "TRL" })).managerConfig).toMatchObject({
			concurrency: 2,
			directory: "/tmp/project",
		}),
	);
	expect(concurrency).toHaveProperty("value", "2");
});

test("the folder result preserves a concurrency edit made while the dialog is open", async () => {
	const server = createFakeServer();
	server.state.directorySelection = "/tmp/project";
	const user = userEvent.setup();
	renderApp({ path: "/p/TRL/settings/manager", actor: "navid", server });
	const folder = await screen.findByRole("textbox", { name: "Project directory" });
	const hold = server.holdNext("system.chooseDirectory");
	await user.click(folder);
	await waitFor(() => expect(server.callsTo("system.chooseDirectory")).toHaveLength(1));
	const concurrency = screen.getByRole("spinbutton", { name: "Concurrency" });
	await user.clear(concurrency);
	await user.type(concurrency, "4");
	await user.tab();
	hold.release();
	await waitFor(async () =>
		expect((await server.client.projects.get({ project: "TRL" })).managerConfig).toMatchObject({
			concurrency: 4,
			directory: "/tmp/project",
		}),
	);
});

test("invalid concurrency stays visible without a save and a folder error permits another selection", async () => {
	const server = createFakeServer();
	const user = userEvent.setup();
	renderApp({ path: "/p/TRL/settings/manager", actor: "navid", server });
	const concurrency = await screen.findByRole("spinbutton", { name: "Concurrency" });
	await user.clear(concurrency);
	await user.type(concurrency, "65");
	await user.tab();
	expect((await screen.findByRole("alert")).textContent).toContain("Enter a whole number from 1 to 64.");
	expect(server.callsTo("projects.update")).toHaveLength(0);
	await user.clear(concurrency);
	await user.type(concurrency, "4");
	await user.tab();
	await waitFor(() => expect(server.callsTo("projects.update")).toHaveLength(1));
	server.failNext("system.chooseDirectory", { code: "NOT_FOUND" });
	await user.click(screen.getByRole("textbox", { name: "Project directory" }));
	expect((await screen.findByRole("alert")).textContent).toContain("Could not open the folder selector.");
	server.state.directorySelection = "/tmp/selected";
	await user.click(screen.getByRole("textbox", { name: "Project directory" }));
	await waitFor(async () =>
		expect((await server.client.projects.get({ project: "TRL" })).managerConfig?.directory).toBe("/tmp/selected"),
	);
	await user.click(screen.getByRole("button", { name: "Clear directory" }));
	await waitFor(async () =>
		expect((await server.client.projects.get({ project: "TRL" })).managerConfig?.directory).toBe(""),
	);
});
