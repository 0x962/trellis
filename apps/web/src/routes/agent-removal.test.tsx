import { beforeEach, describe, expect, test } from "bun:test";
import { act, screen } from "@testing-library/react";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";
import { settle } from "../../test/ticketHost";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("manual ticket workflow", () => {
	test("the retired agents URL has no page", async () => {
		renderApp({ path: "/agents", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "Page not found" })).toBeDefined();
	});

	test("the sidebar has no Agents link", async () => {
		renderApp({ path: "/all", actor: "navid" });
		expect(await screen.findByRole("link", { name: "Settings" })).toBeDefined();
		expect(screen.queryByRole("link", { name: "Agents" })).toBeNull();
	});

	test("settings keeps the command template without agent controls", async () => {
		renderApp({ path: "/settings", actor: "navid" });
		expect(await screen.findByRole("textbox", { name: /start with agent/i })).toBeDefined();
		await act(() => settle());
		expect(screen.queryByRole("region", { name: "Agent manager" })).toBeNull();
	});

	test("the project header has no manager controls", async () => {
		renderApp({ path: "/p/CDE", actor: "navid" });
		expect(await screen.findByRole("heading", { level: 1 })).toBeDefined();
		await act(() => settle());
		expect(screen.queryByRole("group", { name: "Manager" })).toBeNull();
	});

	test("the ticket keeps the manual command without session controls", async () => {
		renderApp({ path: "/t/CDE-42", actor: "navid" });
		expect(await screen.findByRole("button", { name: "Start with agent" })).toBeDefined();
		expect(screen.queryByText("Agents", { exact: true })).toBeNull();
	});
});
