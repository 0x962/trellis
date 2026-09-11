import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { callsTo, lastCallTo } from "../../test/inbox";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";
import { clearStoredActorName, storedActorName } from "../../test/rows";
import { createTestServer, type TestServer } from "../../test/server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const cached = () => JSON.parse(localStorage.getItem("trellis.actor")!) as { name: string; kind: string };

// Stores `name` in the server settings, as the setup form or the settings
// page of another browser does.
const storeName = async (server: TestServer, name: string) => {
	const settings = await server.client.settings.get();
	await server.client.settings.set({ ...settings, defaultActorName: name });
};

// The server holds the identity. localStorage keeps a copy so the request
// header is ready before the first response, and the server copy wins.
describe("routes/__root identity", () => {
	test("a fresh browser uses the stored server actor and lands on /needs-you", async () => {
		const server = createTestServer();
		await storeName(server, "nkhan");
		const { router, client } = renderApp({ path: "/", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		expect(await screen.findByRole("heading", { name: /Needs you/ })).toBeDefined();
		expect(screen.queryByRole("heading", { name: "Enter your name" })).toBeNull();
		expect(cached()).toEqual({ name: "nkhan", kind: "human" });
		await client.projects.list({});
		expect(lastCallTo(server, "projects.list")!.actor).toBe("human:nkhan");
	});

	test("a server name replaces a stale name in the browser", async () => {
		const server = createTestServer();
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
		const server = createTestServer();
		await clearStoredActorName();
		const { router } = renderApp({ path: "/needs-you", actor: "navid", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		await waitFor(() => expect(lastCallTo(server, "settings.set")?.input).toMatchObject({ defaultActorName: "navid" }));
		expect(await storedActorName(server)).toBe("navid");
		expect(cached().name).toBe("navid");
	});

	test("with projects and no stored name, a fresh browser adopts and stores the server default", async () => {
		const server = createTestServer();
		await clearStoredActorName();
		// Without a stored name the server reports the machine name.
		const machine = (await server.client.actors.default()).name;
		const { router } = renderApp({ path: "/", server });
		await waitFor(() => expect(router.state.location.pathname).toBe("/needs-you"));
		expect(screen.queryByRole("heading", { name: "Enter your name" })).toBeNull();
		expect(cached().name).toBe(machine);
		await waitFor(async () => expect((await server.client.actors.default()).stored).toBe(true));
		expect(await storedActorName(server)).toBe(machine);
	});

	test("a stored actor and no project opens the project step only", async () => {
		const server = createTestServer({ empty: true });
		await storeName(server, "nkhan");
		const { router } = renderApp({ path: "/all", server });
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		expect(router.state.location.pathname).toBe("/setup");
		expect((router.state.location.search as { step?: string }).step).toBe("project");
		expect(screen.queryByRole("heading", { name: "Enter your name" })).toBeNull();
		expect(cached().name).toBe("nkhan");
	});

	test("only a server with no stored actor and no project shows the full first run", async () => {
		const server = createTestServer({ empty: true });
		const { router } = renderApp({ path: "/all", server });
		expect(await screen.findByRole("heading", { name: "Enter your name" })).toBeDefined();
		expect(router.state.location.pathname).toBe("/setup");
		// Spec SU-1: two dots show the step; their label names it.
		expect(screen.getByRole("img", { name: "Step 1 of 2" })).toBeDefined();
		expect(localStorage.getItem("trellis.actor")).toBeNull();
		expect(callsTo(server, "settings.set")).toHaveLength(0);
	});
});
