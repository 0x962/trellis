import { expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../test/fake-server";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { NewSubprojectDialog } from "./NewSubprojectDialog";

test("a sub-project uses a slideout and requires a name and slug", async () => {
	const server = createFakeServer();
	const project = (await server.client.projects.list({}))[0]!;
	let closed = false;
	renderWithProviders(
		<NewSubprojectDialog
			project={project}
			open
			onOpenChange={() => {
				closed = true;
			}}
		/>,
		{ path: "/all", actor: "navid", server },
	);
	const dialog = await screen.findByRole("dialog");
	expect(dialog.className).toContain("right-0");
	const form = within(dialog);
	expect(form.getByRole("button", { name: "Create sub-project" }).hasAttribute("disabled")).toBe(true);
	const user = userEvent.setup();
	await user.type(form.getByRole("textbox", { name: "Project name" }), "Widgets");
	await user.type(form.getByRole("textbox", { name: "Slug" }), "widgets");
	await user.click(form.getByRole("button", { name: "Create sub-project" }));
	await waitFor(() => expect(closed).toBe(true));
	expect((await server.client.projects.list({})).some((item) => item.name === "Widgets")).toBe(true);
});
