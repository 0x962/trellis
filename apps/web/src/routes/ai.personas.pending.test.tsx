import { beforeEach, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../test/fake-server";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

test("a pending persona save disables the form and sends one request", async () => {
	const user = userEvent.setup();
	const { server } = renderApp({ path: "/ai/personas", actor: "navid" });
	await user.click(await screen.findByRole("button", { name: "New persona" }));
	const dialog = within(await screen.findByRole("dialog", { name: "New persona" }));
	const name = dialog.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
	await user.type(name, "Reviewer");
	await user.type(dialog.getByRole("textbox", { name: "Instruction" }), "Check claims.");
	const hold = server.holdNext("personas.create");
	await user.click(dialog.getByRole("button", { name: "Create persona" }));
	await waitFor(() => expect(server.callsTo("personas.create")).toHaveLength(1));
	expect((dialog.getByRole("button", { name: "Create persona" }) as HTMLButtonElement).disabled).toBe(true);
	expect(name.disabled).toBe(true);
	expect((dialog.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
	hold.release();
	expect(await screen.findByRole("heading", { name: "Reviewer" })).toBeDefined();
	expect(server.callsTo("personas.create")).toHaveLength(1);
});

test("the persona list shows its pending state before the empty state", async () => {
	const server = createFakeServer();
	const hold = server.holdNext("personas.list");
	renderApp({ path: "/ai/personas", actor: "navid", server });
	expect(await screen.findByRole("status", { name: "Load personas" })).toBeDefined();
	expect(screen.queryByText("No personas yet")).toBeNull();
	hold.release();
	expect(await screen.findByText("No personas yet")).toBeDefined();
});
