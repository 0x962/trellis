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
	const sheet = within(await screen.findByRole("dialog", { name: "Assign a new agent" }));
	expect(sheet.getByRole("button", { name: "Start agent" }).hasAttribute("disabled")).toBe(true);
	expect(sheet.getByRole("combobox", { name: "Persona" }).textContent).toContain("Select a persona");
	await user.click(sheet.getByRole("combobox", { name: "Persona" }));
	expect(screen.queryByRole("option", { name: "Coordinator" })).toBeNull();
	await user.click(await screen.findByRole("option", { name: "Feature Builder" }));
	expect(sheet.getByText("Build the selected ticket.")).toBeDefined();
	await user.click(sheet.getByRole("button", { name: "Start agent" }));
	await waitFor(() => expect(server.callsTo("agentRuns.start")).toHaveLength(1));
	expect(server.callsTo("agentRuns.start")[0]!.input).toEqual({ personaId: persona.id, ticket: "CDE-42" });
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(await screen.findByRole("button", { name: /Ada Finch/ })).toBeDefined();
});

test("the Agents page starts a manager from a selected project and manager persona", async () => {
	const server = createFakeServer();
	const manager = await server.client.personas.create({
		name: "Trellis Manager",
		kind: "manager",
		instruction: "Manage the project.",
	});
	const user = userEvent.setup();
	renderApp({ path: "/ai/agents", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "New manager" }));
	const sheet = within(await screen.findByRole("dialog", { name: "Start a manager" }));
	await user.click(sheet.getByRole("combobox", { name: "Project" }));
	await user.click((await screen.findAllByRole("option"))[0]!);
	await user.click(sheet.getByRole("combobox", { name: "Persona" }));
	await user.click(await screen.findByRole("option", { name: "Trellis Manager" }));
	await user.click(sheet.getByRole("button", { name: "Start manager" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(server.callsTo("agentRuns.start")[0]!.input).toMatchObject({ personaId: manager.id });
	const group = within(await screen.findByRole("region", { name: "Managers" }));
	expect(group.getByRole("article", { name: "Ada Finch" })).toBeDefined();
});

test("a rejected start retains the selected persona and displays the error", async () => {
	const server = createFakeServer();
	await server.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." });
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "New agent" }));
	const sheet = within(await screen.findByRole("dialog", { name: "Assign a new agent" }));
	await user.click(sheet.getByRole("combobox", { name: "Persona" }));
	await user.click(await screen.findByRole("option", { name: "Builder" }));
	server.failNext("agentRuns.start", { code: "DUPLICATE", data: { field: "active agent" } });
	await user.click(sheet.getByRole("button", { name: "Start agent" }));
	expect((await sheet.findByRole("alert")).textContent).toContain("Could not start the agent");
	expect(sheet.getByRole("combobox", { name: "Persona" }).textContent).toContain("Builder");
});

test("an agent slideout shows output and sends a follow-up", async () => {
	const server = createFakeServer();
	const persona = await server.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." });
	await server.client.agentRuns.start({ personaId: persona.id, ticket: "CDE-42" });
	const user = userEvent.setup();
	renderApp({ path: "/ai/agents", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "View Ada Finch" }));
	expect(await screen.findByText("Agent output")).toBeDefined();
	await user.type(screen.getByRole("textbox", { name: "Follow-up" }), "Please fix the failing check.");
	await user.click(screen.getByRole("button", { name: "Send follow-up" }));
	await waitFor(() => expect(server.callsTo("agentRuns.send")).toHaveLength(1));
	expect(server.callsTo("agentRuns.send")[0]!.input).toMatchObject({ text: "Please fix the failing check." });
});
