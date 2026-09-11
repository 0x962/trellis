import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { addSession } from "../../../../test/agents";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("routes/p/$ manager", () => {
	test("the project header shows the manager's state", async () => {
		const server = createTestServer();
		addSession(server, { role: "manager" });
		renderApp({ path: "/p/CDE", actor: "navid", server });
		const header = (await screen.findByRole("heading", { level: 1 })).closest("header")!;
		const group = await within(header).findByRole("group", { name: "Manager" });
		expect(await within(group).findByText("Running")).toBeDefined();
	});
});
