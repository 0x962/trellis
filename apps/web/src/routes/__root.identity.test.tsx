import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { createFakeServer, type FakeServer } from "../../test/fake-server";
import { callsTo, lastCallTo } from "../../test/inbox";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const cached = () => JSON.parse(localStorage.getItem("trellis.actor")!) as { name: string; kind: string };

// Stores `name` in the server settings, as the setup form or the settings
// page of another browser does.
const storeName = async (server: FakeServer, name: string) => {
	const settings = await server.client.settings.get();
	await server.client.settings.set({ ...settings, defaultActorName: name });
};

// The server holds the identity. localStorage keeps a copy so the request
// header is ready before the first response, and the server copy wins.
describe("routes/__root identity", () => {
	test("a fresh browser uses the stored server actor and lands on /needs-you", async () => {
		const server = createFakeServer();
		await storeName(server, "nkhan");
		const { router, client } = renderApp({ path: "/", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
		expect(screen.queryByRole("heading", { name: "What should we call you?" })).toBeNull();
		expect(cached()).toEqual({ name: "nkhan", kind: "human" });
		await client.projects.list({});
		expect(lastCallTo(server, "projects.list")!.actor).toBe("human:nkhan");
	});

	test("a server name replaces a stale name in the browser", async () => {
		const server = createFakeServer();
		await storeName(server, "nkhan");
		const { router } = renderApp({ path: "/needs-you", actor: "navid", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		await waitFor(() => expect(cached().name).toBe("nkhan"));
		expect(await screen.findByRole("button", { name: /^nkhan/ })).toBeDefined();
	});

	// A server set up before the name moved to the settings has projects and
	// no stored name. The first browser to load keeps its own name and
	// stores it, so every later browser agrees with it.
	test("a name cached before the server stored one is saved to the server", async () => {
		const server = createFakeServer();
		server.state.defaultActorStored = false;
		server.state.settings.defaultActorName = "navidkhan";
		const { router } = renderApp({ path: "/needs-you", actor: "navid", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		await waitFor(() => expect(lastCallTo(server, "settings.set")?.input).toMatchObject({ defaultActorName: "navid" }));
		expect(server.state.settings.defaultActorName).toBe("navid");
		expect(cached().name).toBe("navid");
	});

	test("with projects and no stored name, a fresh browser adopts and stores the server default", async () => {
		const server = createFakeServer();
		server.state.defaultActorStored = false;
		server.state.settings.defaultActorName = "navidkhan";
		const { router } = renderApp({ path: "/", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		expect(screen.queryByRole("heading", { name: "What should we call you?" })).toBeNull();
		expect(cached().name).toBe("navidkhan");
		await waitFor(() => expect(server.state.defaultActorStored).toBe(true));
		expect(server.state.settings.defaultActorName).toBe("navidkhan");
	});

	test("a stored actor and no project opens the project step only", async () => {
		const server = createFakeServer({ empty: true });
		await storeName(server, "nkhan");
		const { router } = renderApp({ path: "/all", server });
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		expect(router.state.location.pathname).toBe("/setup");
		expect((router.state.location.search as { step?: string }).step).toBe("project");
		expect(screen.queryByRole("heading", { name: "What should we call you?" })).toBeNull();
		expect(cached().name).toBe("nkhan");
	});

	test("only a server with no stored actor and no project shows the full first run", async () => {
		const server = createFakeServer({ empty: true });
		const { router } = renderApp({ path: "/all", server });
		expect(await screen.findByRole("heading", { name: "What should we call you?" })).toBeDefined();
		expect(router.state.location.pathname).toBe("/setup");
		expect(screen.getByText("Step 1 of 2")).toBeDefined();
		expect(localStorage.getItem("trellis.actor")).toBeNull();
		expect(callsTo(server, "settings.set")).toHaveLength(0);
	});
});
