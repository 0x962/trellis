import { expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../test/renderWithProviders";

test("Settings edits the agent launch template in a slideout", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/settings#agents", actor: "navid" });
	await user.click(await screen.findByRole("button", { name: "Configure agent launch" }));
	const dialog = await screen.findByRole("dialog", { name: "Agent launch command" });
	expect(dialog.className).toContain("right-0");
	const field = screen.getByRole("textbox", { name: "Command template" }) as HTMLTextAreaElement;
	expect(field.value).toContain("{{superset}}");
	await user.clear(field);
	await user.type(field, "custom-launch --prompt {{{{prompt}}");
	await user.click(screen.getByRole("button", { name: "Save command" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect((await server.client.settings.get()).agentLaunchCommand).toContain("custom-launch");
});
