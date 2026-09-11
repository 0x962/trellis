import { beforeEach, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../test/fake-server";
import { renderApp } from "../../test/renderWithProviders";

beforeEach(() => localStorage.clear());

test("personas appear as cards grouped by kind", async () => {
	const server = createFakeServer();
	for (const kind of ["builder", "reviewer", "manager"] as const) {
		await server.client.personas.create({ name: `${kind} example`, kind, instruction: `Instructions for ${kind}.` });
	}
	renderApp({ path: "/ai/personas", actor: "navid", server });
	for (const [kind, group] of [
		["builder", "Builders"],
		["reviewer", "Reviewers"],
		["manager", "Managers"],
	]) {
		const section = within(await screen.findByRole("region", { name: group }));
		expect(section.getByRole("article", { name: `${kind} example` })).toBeDefined();
	}
});

test("a slideout edits kind and moves the card to its new group", async () => {
	const user = userEvent.setup();
	const server = createFakeServer();
	await server.client.personas.create({ name: "Coordinator", kind: "builder", instruction: "Read the task." });
	renderApp({ path: "/ai/personas", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "Edit Coordinator" }));
	const sheet = await screen.findByRole("dialog", { name: "Edit persona" });
	expect(sheet.className).toContain("right-0");
	await user.click(within(sheet).getByRole("combobox", { name: "Kind" }));
	await user.click(await screen.findByRole("option", { name: "Manager" }));
	await user.click(within(sheet).getByRole("button", { name: "Save changes" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(
		within(screen.getByRole("region", { name: "Managers" })).getByRole("article", { name: "Coordinator" }),
	).toBeDefined();
	expect((await server.client.personas.list({}))[0]!.kind).toBe("manager");
});

test("delete asks for confirmation inside the slideout and removes the card", async () => {
	const user = userEvent.setup();
	const server = createFakeServer();
	await server.client.personas.create({ name: "Temporary", kind: "reviewer", instruction: "Read." });
	renderApp({ path: "/ai/personas", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "Edit Temporary" }));
	const sheet = within(await screen.findByRole("dialog", { name: "Edit persona" }));
	await user.click(sheet.getByRole("button", { name: "Delete persona" }));
	expect(await sheet.findByText("Delete “Temporary”?")).toBeDefined();
	expect(await server.client.personas.list({})).toHaveLength(1);
	await user.click(sheet.getByRole("button", { name: "Confirm delete" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(await screen.findByText("No personas yet")).toBeDefined();
	expect(await server.client.personas.list({})).toEqual([]);
});

test("a failed delete keeps the persona and the open editor", async () => {
	const user = userEvent.setup();
	const server = createFakeServer();
	await server.client.personas.create({ name: "Keep", kind: "manager", instruction: "Manage." });
	renderApp({ path: "/ai/personas", actor: "navid", server });
	await user.click(await screen.findByRole("button", { name: "Edit Keep" }));
	const sheet = within(await screen.findByRole("dialog", { name: "Edit persona" }));
	await user.click(sheet.getByRole("button", { name: "Delete persona" }));
	server.failNext("personas.delete", { code: "INPUT_VALIDATION_FAILED", data: { issues: [] } });
	await user.click(sheet.getByRole("button", { name: "Confirm delete" }));
	expect((await sheet.findByRole("alert")).textContent).toContain("Could not delete the persona.");
	expect(await server.client.personas.list({})).toHaveLength(1);
});
