import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../test/fake-server";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

describe("routes/setup", () => {
	// WS-72
	test("setup step 1 asks for a name prefilled from actors.default", async () => {
		const user = userEvent.setup();
		renderApp({ path: "/setup" });
		expect(await screen.findByRole("heading", { name: "What should we call you?" })).toBeDefined();
		const input = await screen.findByDisplayValue("navid");
		expect(document.activeElement).toBe(input);
		const submit = screen.getByRole("button", { name: "Continue" });
		expect(submit.hasAttribute("disabled")).toBe(false);
		await user.clear(input);
		expect(submit.hasAttribute("disabled")).toBe(true);
		expect(localStorage.getItem("trellis.actor")).toBeNull();
	});

	// WS-73
	test("Continue stores the identity and advances to the project step", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/setup", server: createFakeServer({ empty: true }) });
		const input = await screen.findByDisplayValue("navid");
		await user.clear(input);
		await user.type(input, "navid{Enter}");
		expect(localStorage.getItem("trellis.actor")).toBe('{"name":"navid","kind":"human"}');
		expect(await screen.findByRole("heading", { name: "Create your first project" })).toBeDefined();
		expect(screen.queryByRole("heading", { name: "What should we call you?" })).toBeNull();
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
		expect(screen.getByText(`Tickets will be numbered ${key.value}-1, ${key.value}-2 …`)).toBeDefined();
		const create = screen.getByRole("button", { name: "Create" });
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
		expect(screen.getByText(/taken/i)).toBeDefined();
		await user.clear(key);
		await user.type(key, "CDX");
		expect(create.hasAttribute("disabled")).toBe(false);
	});

	// WS-76
	test("creating the first project lands on its empty table", async () => {
		const user = userEvent.setup();
		const server = createFakeServer({ empty: true });
		const { router } = renderApp({ path: "/setup", actor: "navid", server });
		const name = await screen.findByRole("textbox", { name: /project name/i });
		await user.type(name, "Docs");
		const key = screen.getByRole("textbox", { name: /key/i }) as HTMLInputElement;
		await waitFor(() => expect(key.value).toBe("DO"));
		await user.clear(key);
		await user.type(key, "DOC");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/p/DOC"));
		const call = server.calls.find((entry) => entry.path.join(".") === "projects.create");
		expect(call).toBeDefined();
		expect(call!.input).toEqual({ key: "DOC", name: "Docs" });
		expect(call!.actor).toBe("human:navid");
		expect(await screen.findByText(/trellis new -p DOC "/)).toBeDefined();
		expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeDefined();
	});
});
