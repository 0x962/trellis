import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { callsTo } from "../../test/inbox";
import { renderApp } from "../../test/renderWithProviders";
import { clearStoredActorName, storedActorName } from "../../test/rows";
import { createTestServer } from "../../test/server";

beforeEach(() => localStorage.clear());

describe("routes/setup", () => {
	// WS-72. Only a first-run server shows the name step.
	test("setup step 1 asks for a name prefilled from actors.default", async () => {
		const user = userEvent.setup();
		const server = createTestServer({ empty: true });
		// A first-run server stores no name, so `actors.default` reports the
		// name of the machine account.
		const machine = (await server.client.actors.default()).name;
		renderApp({ path: "/setup", server });
		expect(await screen.findByRole("heading", { name: "Enter your name" })).toBeDefined();
		const input = await screen.findByDisplayValue(machine);
		expect(document.activeElement).toBe(input);
		const submit = screen.getByRole("button", { name: /^Continue/ });
		expect(submit.hasAttribute("disabled")).toBe(false);
		await user.clear(input);
		expect(submit.hasAttribute("disabled")).toBe(true);
		expect(localStorage.getItem("trellis.actor")).toBeNull();
	});

	// WS-73
	test("Continue stores the identity and advances to the project step", async () => {
		const user = userEvent.setup();
		const server = createTestServer({ empty: true });
		const machine = (await server.client.actors.default()).name;
		const { router } = renderApp({ path: "/setup", server });
		const input = await screen.findByDisplayValue(machine);
		await user.clear(input);
		await user.type(input, "navid{Enter}");
		expect(localStorage.getItem("trellis.actor")).toBe('{"name":"navid","kind":"human"}');
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		expect(screen.queryByRole("heading", { name: "Enter your name" })).toBeNull();
		expect(router.state.location.pathname).toBe("/setup");
	});

	// WS-75. The key follows the name until the person edits it, and every
	// edit is validated live: A to Z, 2 to 5 characters, not taken.
	test("setup step 2 suggests a free key and validates the edit live", async () => {
		const user = userEvent.setup();
		renderApp({ path: "/setup?step=project", actor: "navid" });
		const name = await screen.findByRole("textbox", { name: /project name/i });
		await user.type(name, "Cloud Data Engine");
		const key = screen.getByRole("textbox", { name: /key/i }) as HTMLInputElement;
		await waitFor(() => expect(key.value).toMatch(/^[A-Z][A-Z0-9]{1,4}$/));
		expect(["CDE", "TRL", "MRG"]).not.toContain(key.value);
		// Spec SU-2: a live chip shows the first ticket ID of the key.
		expect(document.querySelector("[data-key-preview]")?.textContent).toContain(`${key.value}-1`);
		const create = screen.getByRole("button", { name: /^Create/ });
		expect(create.hasAttribute("disabled")).toBe(false);
		await user.clear(key);
		await user.type(key, "c");
		expect(create.hasAttribute("disabled")).toBe(true);
		expect(key.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByText(/2 to 5/)).toBeDefined();
		await user.clear(key);
		await user.type(key, "ABCDEF");
		expect(create.hasAttribute("disabled")).toBe(true);
		expect(key.getAttribute("aria-invalid")).toBe("true");
		await user.clear(key);
		await user.type(key, "CDE");
		expect(create.hasAttribute("disabled")).toBe(true);
		expect(screen.getByText("Another project uses the key CDE.")).toBeDefined();
		await user.clear(key);
		await user.type(key, "CDX");
		expect(create.hasAttribute("disabled")).toBe(false);
	});

	// WS-76
	test("creating the first project lands on its empty board", async () => {
		const user = userEvent.setup();
		const server = createTestServer({ empty: true });
		const { router } = renderApp({ path: "/setup", actor: "navid", server });
		const name = await screen.findByRole("textbox", { name: /project name/i });
		await user.type(name, "Docs");
		const key = screen.getByRole("textbox", { name: /key/i }) as HTMLInputElement;
		await waitFor(() => expect(key.value).toBe("DO"));
		await user.clear(key);
		await user.type(key, "DOC");
		await user.click(screen.getByRole("button", { name: /^Create/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/DOC"));
		const call = server.calls.find((entry) => entry.path.join(".") === "projects.create");
		expect(call).toBeDefined();
		expect(call!.input).toEqual({ key: "DOC", name: "Docs" });
		expect(call!.actor).toBe("human:navid");
		// The board is the view a project opens in, so the empty state here is
		// the board and not the table's CLI line.
		expect(await screen.findByRole("status", { name: "Board drag status" })).toBeDefined();
		expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeDefined();
	});

	// The server name is the identity every browser reads, so the name step
	// writes it there as well as to the browser copy.
	test("the name step pre-fills defaultActorName and saves the name to the server", async () => {
		const user = userEvent.setup();
		const server = createTestServer({ empty: true });
		// The name step shows while no name is stored, so the field is
		// pre-filled with the machine name the server reports.
		const machine = (await server.client.actors.default()).name;
		renderApp({ path: "/setup", server });
		const input = await screen.findByDisplayValue(machine);
		await user.clear(input);
		await user.type(input, "navid{Enter}");
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		const call = server.callsTo("settings.set").at(-1)!;
		expect(call.input).toMatchObject({ defaultActorName: "navid" });
		expect(call.actor).toBe("human:navid");
		expect(await storedActorName(server)).toBe("navid");
		expect(await server.client.actors.default()).toEqual({ name: "navid", kind: "human", stored: true });
		expect(localStorage.getItem("trellis.actor")).toBe('{"name":"navid","kind":"human"}');
	});

	test("with projects on the server, /setup never asks for a name or a first project", async () => {
		for (const stored of [true, false]) {
			const server = createTestServer();
			if (!stored) await clearStoredActorName(server);
			const name = (await server.client.actors.default()).name;
			const view = renderApp({ path: "/setup", server });
			await waitFor(() => expect(view.router.state.location.pathname, String(stored)).toBe("/needs-you"));
			expect(screen.queryByRole("heading", { name: "Enter your name" })).toBeNull();
			expect(screen.queryByRole("heading", { name: "Create your first project" })).toBeNull();
			expect(screen.queryByRole("heading", { name: "New project" })).toBeNull();
			expect(localStorage.getItem("trellis.actor")).toBe(JSON.stringify({ name, kind: "human" }));
			view.unmount();
			localStorage.clear();
		}
	});

	// Two setups once made two projects both named "Operator".
	test("the project step refuses a name another root project has", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/setup?step=project", actor: "navid" });
		const name = await screen.findByRole("textbox", { name: /project name/i });
		const create = screen.getByRole("button", { name: /^Create/ });
		await user.type(name, "Trellis");
		expect(create.hasAttribute("disabled")).toBe(true);
		expect(name.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByText("A project named Trellis exists.")).toBeDefined();
		await user.type(name, " two");
		expect(create.hasAttribute("disabled")).toBe(false);
		expect(callsTo(server, "projects.create")).toHaveLength(0);
	});
});
