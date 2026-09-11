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
	await user.type(screen.getByRole("textbox", { name: "Project directory" }), "/tmp/project");
	await user.click(screen.getByRole("button", { name: "Save manager settings" }));
	await waitFor(() => expect(server.callsTo("projects.update")).toHaveLength(1));
	expect((await server.client.projects.get({ project: "CDE" })).managerConfig).toEqual({
		personaId: manager.id,
		concurrency: 2,
		directory: "/tmp/project",
	});
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
	renderApp({ path: "/p/TRL/settings/manager", actor: "navid", server });
	await user.type(await screen.findByRole("textbox", { name: "Repository" }), "https://github.com/0x962/trellis");
	await user.click(screen.getByRole("button", { name: "Add repository" }));
	await waitFor(() => expect(server.callsTo("projects.setRepos")).toHaveLength(1));
	expect(screen.getByRole("link", { name: "0x962/trellis" }).getAttribute("href")).toBe(
		"https://github.com/0x962/trellis",
	);
	server.failNext("projects.update", { code: "PROJECT_ARCHIVED" });
	await user.type(screen.getByRole("textbox", { name: "Project directory" }), "/tmp/draft");
	await user.click(screen.getByRole("button", { name: "Save manager settings" }));
	expect((await screen.findByRole("alert")).textContent).toContain("Could not save manager settings");
	expect(screen.getByRole("textbox", { name: "Project directory" })).toHaveProperty("value", "/tmp/draft");
});
