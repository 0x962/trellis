import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { addSession } from "../../../../test/agents";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("routes/p/$ manager", () => {
	test("the project header stays clear while the manager runs", async () => {
		const server = createTestServer();
		addSession(server, { role: "manager" });
		renderApp({ path: "/p/CDE/table", actor: "navid", server });
		await screen.findByRole("heading", { level: 1 });
		expect(screen.queryByRole("group", { name: "Manager" })).toBeNull();
	});
});
