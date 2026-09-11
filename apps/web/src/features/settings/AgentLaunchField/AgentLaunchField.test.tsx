import { expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_AGENT_LAUNCH_COMMAND } from "@trellis/api";
import { renderApp } from "../../../../test/renderWithProviders";

test("Settings shows the agent launch command inline and saves on blur", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	const field = await screen.findByRole("textbox", { name: "Command template" });
	expect(field).toHaveProperty("value", DEFAULT_AGENT_LAUNCH_COMMAND);
	expect(screen.queryByRole("button", { name: "Configure agent launch" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Save command" })).toBeNull();
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByText("{{prompt}}", { selector: "code" })).toBeDefined();
	await user.click(field);
	fireEvent.change(field, { target: { value: "custom-launch --prompt {{prompt}}" } });
	await user.tab();
	await waitFor(async () =>
		expect((await server.client.settings.get()).agentLaunchCommand).toBe("custom-launch --prompt {{prompt}}"),
	);
	expect(await screen.findByText("Saved", { selector: '[role="status"]' })).toBeDefined();
});

test("an invalid launch command stays inline and does not save", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	const field = await screen.findByRole("textbox", { name: "Command template" });
	await user.click(field);
	fireEvent.change(field, { target: { value: "launch {{unknown}}" } });
	await user.tab();
	expect((await screen.findByRole("alert")).textContent).toContain("Unknown variables: unknown");
	expect(server.callsTo("settings.set")).toHaveLength(0);
	await user.click(field);
	fireEvent.change(field, { target: { value: " " } });
	await user.tab();
	expect((await screen.findByRole("alert")).textContent).toContain("Enter a command.");
	expect(server.callsTo("settings.set")).toHaveLength(0);
});

test("a refused autosave keeps the command and permits a retry", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	const field = await screen.findByRole("textbox", { name: "Command template" });
	server.failNext("settings.set", { code: "NOT_FOUND" });
	await user.click(field);
	fireEvent.change(field, { target: { value: "my-agent {{prompt}}" } });
	await user.tab();
	expect((await screen.findByRole("alert")).textContent).toContain("Could not save the command.");
	expect(field).toHaveProperty("value", "my-agent {{prompt}}");
	await user.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(async () =>
		expect((await server.client.settings.get()).agentLaunchCommand).toBe("my-agent {{prompt}}"),
	);
});

test("a pending save preserves a newer command and saves both edits in order", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	const field = await screen.findByRole("textbox", { name: "Command template" });
	const hold = server.holdNext("settings.set");
	await user.click(field);
	fireEvent.change(field, { target: { value: "first-agent {{prompt}}" } });
	await user.tab();
	await waitFor(() => expect(server.callsTo("settings.set")).toHaveLength(1));
	await user.click(field);
	fireEvent.change(field, { target: { value: "second-agent {{prompt}}" } });
	await user.tab();
	hold.release();
	await waitFor(async () =>
		expect((await server.client.settings.get()).agentLaunchCommand).toBe("second-agent {{prompt}}"),
	);
	expect(field).toHaveProperty("value", "second-agent {{prompt}}");
	expect(server.callsTo("settings.set")).toHaveLength(2);
});

test("restore Superset saves its default command without a separate save", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	const field = await screen.findByRole("textbox", { name: "Command template" });
	await user.click(field);
	fireEvent.change(field, { target: { value: "custom-agent {{prompt}}" } });
	await user.tab();
	await waitFor(async () =>
		expect((await server.client.settings.get()).agentLaunchCommand).toBe("custom-agent {{prompt}}"),
	);
	await user.click(screen.getByRole("button", { name: "Use Superset default" }));
	await waitFor(async () =>
		expect((await server.client.settings.get()).agentLaunchCommand).toBe(DEFAULT_AGENT_LAUNCH_COMMAND),
	);
	expect(field).toHaveProperty("value", DEFAULT_AGENT_LAUNCH_COMMAND);
	expect((await server.client.settings.get()).stalledHours).toBe(24);
});

test("restore the original text while a save is pending still saves that text", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	const field = await screen.findByRole("textbox", { name: "Command template" });
	const hold = server.holdNext("settings.set");
	await user.click(field);
	fireEvent.change(field, { target: { value: "temporary-agent {{prompt}}" } });
	await user.tab();
	await waitFor(() => expect(server.callsTo("settings.set")).toHaveLength(1));
	await user.click(field);
	fireEvent.change(field, { target: { value: DEFAULT_AGENT_LAUNCH_COMMAND } });
	await user.tab();
	hold.release();
	await waitFor(() => expect(server.callsTo("settings.set")).toHaveLength(2));
	await waitFor(async () =>
		expect((await server.client.settings.get()).agentLaunchCommand).toBe(DEFAULT_AGENT_LAUNCH_COMMAND),
	);
});
