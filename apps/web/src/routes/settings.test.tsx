import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_AGENT_LAUNCH_COMMAND } from "@trellis/api";
import { themeStorageKey } from "@trellis/ui";
import { createFakeServer } from "../../test/fake-server";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	mockMatchMedia(false);
});

describe("routes/settings", () => {
	test("settings sections have direct links, one visible page, and browser history", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/settings", actor: "navid" });
		const nav = await screen.findByRole("navigation", { name: "Settings" });
		expect(within(nav).getAllByRole("link")).toHaveLength(3);
		expect(await screen.findByRole("heading", { name: "Account", level: 2 })).toBeDefined();
		expect(screen.queryByRole("textbox", { name: /diff url template/i })).toBeNull();
		await user.click(within(nav).getByRole("link", { name: "Integrations" }));
		await waitFor(() => expect(router.state.location.hash).toBe("integrations"));
		expect(await screen.findByRole("textbox", { name: /diff url template/i })).toBeDefined();
		expect(screen.queryByRole("textbox", { name: /your name/i })).toBeNull();
		expect(within(nav).getByRole("link", { name: "Integrations" }).getAttribute("aria-current")).toBe("page");
		router.history.back();
		expect(await screen.findByRole("textbox", { name: /your name/i })).toBeDefined();
	});

	// WS-77
	test("settings shows the actor, the theme, the diff template, and the gh status", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/settings", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "Settings" })).toBeDefined();
		const name = (await screen.findByRole("textbox", { name: /your name/i })) as HTMLInputElement;
		expect(name.value).toBe("navid");
		const theme = screen.getByRole("combobox", { name: "Theme" });
		expect(theme.textContent).toBe("Dark");
		await user.click(theme);
		const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
		expect(options).toEqual(["System", "Light", "Dark"]);
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("link", { name: "Integrations" }));
		const settings = await server.client.settings.get();
		const template = (await screen.findByRole("textbox", { name: /diff url template/i })) as HTMLInputElement;
		expect(template.value).toBe(settings.diffUrlTemplate);
		const health = await server.client.system.health();
		const github = screen.getByText("GitHub").closest("[data-settings-row]")!;
		expect(github).not.toBeNull();
		expect(github.textContent).toContain(health.gh.message!);
	});

	// WS-78
	test("renaming the actor updates the header on the next request", async () => {
		const user = userEvent.setup();
		const { server, client } = renderApp({ path: "/settings", actor: "navid" });
		const name = (await screen.findByRole("textbox", { name: /your name/i })) as HTMLInputElement;
		await user.clear(name);
		await user.type(name, "nk");
		await user.tab();
		expect(JSON.parse(localStorage.getItem("trellis.actor")!)).toEqual({ name: "nk", kind: "human" });
		await client.projects.list({});
		const last = server.calls.filter((call) => call.path.join(".") === "projects.list").pop()!;
		expect(last.actor).toBe("human:nk");
	});

	// WS-79
	test("a blur on the template calls settings.set", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/settings#integrations", actor: "navid" });
		const before = await server.client.settings.get();
		const template = (await screen.findByRole("textbox", { name: /diff url template/i })) as HTMLInputElement;
		await waitFor(() => expect(template.value).toBe(before.diffUrlTemplate));
		await user.clear(template);
		await user.type(template, "http://margin.localhost/{{url}");
		// Spec ST-4: the field saves on blur. It has no Save button.
		await user.tab();
		const call = await waitFor(() => {
			const found = server.calls.find((entry) => entry.path.join(".") === "settings.set");
			expect(found).toBeDefined();
			return found!;
		});
		expect(call.input).toEqual({ ...before, diffUrlTemplate: "http://margin.localhost/{url}" });
		expect((await server.client.settings.get()).diffUrlTemplate).toBe("http://margin.localhost/{url}");
		expect(await within(template.closest("[data-settings-row]") as HTMLElement).findByText("Saved")).toBeDefined();
	});

	// WS-80
	test("the theme select stamps the choice", async () => {
		const user = userEvent.setup();
		renderApp({ path: "/settings", actor: "navid" });
		const theme = await screen.findByRole("combobox", { name: "Theme" });
		await user.click(theme);
		await user.click(await screen.findByRole("option", { name: "Light" }));
		await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("light"));
		expect(localStorage.getItem(themeStorageKey)).toBe("light");
		expect(screen.getByRole("combobox", { name: "Theme" }).textContent).toBe("Light");
	});
});

describe("settings route", () => {
	// ST-01
	test("renders the actor, theme, diff template, threshold, and gh blocks", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/settings", actor: "navid" });
		expect(await screen.findByRole("textbox", { name: /your name/i })).toBeDefined();
		expect(await screen.findByRole("combobox", { name: "Theme" })).toBeDefined();
		await user.click(
			within(screen.getByRole("navigation", { name: "Settings" })).getByRole("link", { name: "Agents" }),
		);
		expect(await screen.findByRole("spinbutton", { name: /stalled/i })).toBeDefined();
		await user.click(screen.getByRole("link", { name: "Integrations" }));
		expect(await screen.findByRole("textbox", { name: /diff url template/i })).toBeDefined();
		const gh = await server.client.system.gh();
		expect(await screen.findByText(gh.message!)).toBeDefined();
		expect(server.calls.some((call) => call.path.join(".") === "system.gh")).toBe(true);
	});

	// ST-02
	test("loads every field from settings.get", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.settings.set({
			defaultActorName: "Navid",
			stalledHours: 24,
			diffUrlTemplate: "{url}/files",
		});
		renderApp({ path: "/settings", actor: "navid", server });
		await waitFor(async () =>
			expect(((await screen.findByRole("textbox", { name: /your name/i })) as HTMLInputElement).value).toBe("Navid"),
		);
		await user.click(screen.getByRole("link", { name: "Integrations" }));
		expect(((await screen.findByRole("textbox", { name: /diff url template/i })) as HTMLInputElement).value).toBe(
			"{url}/files",
		);
		await user.click(
			within(screen.getByRole("navigation", { name: "Settings" })).getByRole("link", { name: "Agents" }),
		);
		expect(((await screen.findByRole("spinbutton", { name: /stalled/i })) as HTMLInputElement).value).toBe("24");
	});

	// ST-06. settings.set replaces the whole record. Each field saves on its own
	// blur (spec ST-4), so the template saves first, and the name save then
	// carries both edits. No replace drops the edit of another field.
	test("each blur sends one full replace, and the last one holds both edits", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/settings#integrations", actor: "navid" });
		const template = (await screen.findByRole("textbox", { name: /diff url template/i })) as HTMLInputElement;
		await user.clear(template);
		await user.type(template, "http://margin.localhost/{{url}");
		await user.click(screen.getByRole("link", { name: "Account" }));
		const name = await screen.findByRole("textbox", { name: /your name/i });
		await user.clear(name);
		await user.type(name, "Nav");
		await user.tab();
		const calls = await waitFor(() => {
			const found = server.calls.filter((call) => call.path.join(".") === "settings.set");
			expect(found).toHaveLength(2);
			return found;
		});
		expect(calls[1]!.input).toEqual({
			agentLaunchCommand: DEFAULT_AGENT_LAUNCH_COMMAND,
			defaultActorName: "Nav",
			diffUrlTemplate: "http://margin.localhost/{url}",
			stalledHours: 24,
		});
	});

	// The name lives on the server, so a rename in one browser is the name
	// a second browser, with nothing in localStorage, starts with.
	test("shows the stored name, and a rename reaches a second browser", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.settings.set({ ...(await server.client.settings.get()), defaultActorName: "Navid" });
		const first = renderApp({ path: "/settings", server });
		const name = (await screen.findByRole("textbox", { name: /your name/i })) as HTMLInputElement;
		await waitFor(() => expect(name.value).toBe("Navid"));
		await user.clear(name);
		await user.type(name, "nk");
		await user.tab();
		await waitFor(() => expect(server.state.settings.defaultActorName).toBe("nk"));
		first.unmount();
		localStorage.clear();

		const second = renderApp({ path: "/needs-you", server });
		await waitFor(() => expect(second.router.state.location.pathname).toBe("/needs-you"));
		expect(await screen.findByRole("button", { name: /^nk/ })).toBeDefined();
		expect(JSON.parse(localStorage.getItem("trellis.actor")!)).toEqual({ name: "nk", kind: "human" });
	});

	// ST-21. Every control is reachable in the order it is read.
	test("reaches every control by keyboard in reading order", async () => {
		const user = userEvent.setup();
		renderApp({ path: "/settings", actor: "navid" });
		const nav = await screen.findByRole("navigation", { name: "Settings" });
		const account = within(nav).getByRole("link", { name: "Account" });
		const agents = within(nav).getByRole("link", { name: "Agents" });
		const integrations = within(nav).getByRole("link", { name: "Integrations" });
		const name = await screen.findByRole("textbox", { name: /your name/i });
		const theme = await screen.findByRole("combobox", { name: "Theme" });
		const wanted = [account, agents, integrations, name, theme];
		const order: number[] = [];
		account.focus();
		for (let step = 0; step < 12 && order.length < wanted.length; step += 1) {
			const index = wanted.indexOf(document.activeElement as HTMLElement);
			if (index !== -1) order.push(index);
			await user.tab();
		}
		expect(order).toEqual([0, 1, 2, 3, 4]);

		await user.click(agents);
		const threshold = await screen.findByRole("spinbutton", { name: /stalled/i });
		expect(threshold.tabIndex).toBe(0);

		await user.click(integrations);
		const template = await screen.findByRole("textbox", { name: /diff url template/i });
		const copy = await screen.findByRole("button", { name: /copy/i });
		expect(template.tabIndex).toBe(0);
		expect(copy.tabIndex).toBe(0);
		expect(copy.getAttribute("class")).toContain("focus-visible:outline-accent");
	});
});
