import { beforeEach, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

test("settings sections have direct links, one visible page, and browser history", async () => {
	const user = userEvent.setup();
	const { router } = renderApp({ path: "/p/CDE/web/settings", actor: "navid" });
	const nav = await screen.findByRole("navigation", { name: "Project settings" });
	expect(within(nav).getAllByRole("link")).toHaveLength(6);
	expect(await screen.findByRole("heading", { name: "General", level: 2 })).toBeDefined();
	expect(screen.queryByRole("textbox", { name: "Repository" })).toBeNull();
	await user.type(screen.getByRole("textbox", { name: "Project name" }), " draft");
	await user.click(within(nav).getByRole("link", { name: "Repositories" }));
	await waitFor(() => expect(router.state.location.hash).toBe("repositories"));
	expect(await screen.findByRole("textbox", { name: "Repository" })).toBeDefined();
	expect(screen.queryByRole("textbox", { name: "Project name" })).toBeNull();
	expect(within(nav).getByRole("link", { name: "Repositories" }).getAttribute("aria-current")).toBe("page");
	router.history.back();
	expect(await screen.findByRole("textbox", { name: "Project name" })).toHaveProperty("value", "web draft");
});

test("the template page saves only the template", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/p/TRL/settings#template", actor: "navid" });
	const template = await screen.findByRole("textbox", { name: "Ticket template" });
	expect(screen.queryByRole("textbox", { name: "Project name" })).toBeNull();
	await user.clear(template);
	await user.type(template, "## Outcome");
	await user.click(screen.getByRole("button", { name: "Save template" }));
	await waitFor(() =>
		expect(server.callsTo("projects.update").at(-1)?.input).toEqual({
			project: "TRL",
			ticketTemplate: "## Outcome",
		}),
	);
	expect(await screen.findByText("Template saved.")).toBeDefined();
});

test("a direct section link opens for a subproject", async () => {
	renderApp({ path: "/p/CDE/web/settings#statuses", actor: "navid" });
	expect(await screen.findByRole("heading", { name: "Statuses", level: 2 })).toBeDefined();
	expect(await screen.findByText("Inherited from CDE")).toBeDefined();
	expect(screen.queryByRole("textbox", { name: "Project name" })).toBeNull();
});

test("a refused template save keeps the draft and shows the error", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/p/TRL/settings#template", actor: "navid" });
	const template = await screen.findByRole("textbox", { name: "Ticket template" });
	server.failNext("projects.update", { code: "NOT_FOUND", data: { kind: "project", ref: "TRL" } });
	await user.clear(template);
	await user.type(template, "Draft template");
	await user.click(screen.getByRole("button", { name: "Save template" }));
	expect((await screen.findByRole("alert")).textContent).not.toBe("");
	expect(template).toHaveProperty("value", "Draft template");
});
