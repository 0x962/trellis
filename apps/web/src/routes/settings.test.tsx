import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { themeStorageKey } from "@trellis/ui";
import { mockMatchMedia } from "../../test/media";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	mockMatchMedia(false);
});

describe("routes/settings", () => {
	// WS-77
	test("settings shows the actor, the theme, the agent template, and the gh status", async () => {
		const { server } = renderApp({ path: "/settings", actor: "navid" });
		expect(await screen.findByRole("heading", { name: "Settings" })).toBeDefined();
		const name = (await screen.findByRole("textbox", { name: /your name/i })) as HTMLInputElement;
		expect(name.value).toBe("navid");
		const theme = screen.getByRole("combobox", { name: "Theme" });
		expect(theme.textContent).toBe("Dark");
		const settings = await server.client.settings.get();
		const template = (await screen.findByRole("textbox", { name: /start with agent/i })) as HTMLTextAreaElement;
		expect(template.value).toBe(settings.startWithAgentTemplate);
		const health = await server.client.system.health();
		const github = screen.getByText("GitHub").closest("[data-settings-row]")!;
		expect(github).not.toBeNull();
		expect(github.textContent).toContain(health.gh.message!);
		const user = userEvent.setup();
		await user.click(theme);
		const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
		expect(options).toEqual(["System", "Light", "Dark"]);
		await user.keyboard("{Escape}");
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
	test("saving the template calls settings.set", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/settings", actor: "navid" });
		const before = await server.client.settings.get();
		const template = (await screen.findByRole("textbox", { name: /start with agent/i })) as HTMLTextAreaElement;
		await waitFor(() => expect(template.value).toBe(before.startWithAgentTemplate));
		await user.clear(template);
		await user.type(template, 'codex "$(trellis brief {{brief})"');
		await user.click(screen.getByRole("button", { name: "Save" }));
		const call = await waitFor(() => {
			const found = server.calls.find((entry) => entry.path.join(".") === "settings.set");
			expect(found).toBeDefined();
			return found!;
		});
		expect(call.input).toEqual({ ...before, startWithAgentTemplate: 'codex "$(trellis brief {brief})"' });
		expect((await server.client.settings.get()).startWithAgentTemplate).toBe('codex "$(trellis brief {brief})"');
		expect(await screen.findByText("Settings saved")).toBeDefined();
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
