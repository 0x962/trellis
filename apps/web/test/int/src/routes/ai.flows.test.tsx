import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../renderWithProviders";
import { createTestServer } from "../../../server";

beforeEach(() => localStorage.clear());

describe("AI flows", () => {
	test("the sidebar links to Flows after Personas", async () => {
		renderApp({ path: "/all", actor: "dana" });
		await screen.findByRole("heading", { name: "All tickets" });
		const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
		const workspace = within(sidebar).getByRole("navigation", { name: "Workspace" });
		const link = within(workspace).getByRole("link", { name: "Flows" });
		expect(link.getAttribute("href")).toBe("/ai/flows");
		expect(sidebar.textContent!.indexOf("Personas")).toBeLessThan(sidebar.textContent!.indexOf("Flows"));
	});

	test("New flow creates a flow and opens it in the editor", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { router } = renderApp({ path: "/ai/flows", actor: "dana", server });
		expect(await screen.findByText("No flows yet")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "New flow" }));
		const dialog = within(await screen.findByRole("dialog", { name: "New flow" }));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "PR review");
		await user.click(dialog.getByRole("button", { name: "Create flow" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/ai/flows/pr-review"));
		expect(await screen.findByRole("heading", { name: "PR review" })).toBeDefined();
		expect(await server.client.flows.list({})).toMatchObject([{ slug: "pr-review", nodeCount: 0 }]);
	});

	test("an unknown slug shows the missing flow state", async () => {
		renderApp({ path: "/ai/flows/ghost", actor: "dana" });
		expect(await screen.findByText("No flow with this name")).toBeDefined();
	});
});
