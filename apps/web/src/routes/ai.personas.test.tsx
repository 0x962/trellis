import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../test/renderWithProviders";
import { createTestServer } from "../../test/server";

beforeEach(() => localStorage.clear());

describe("AI personas", () => {
	test("the sidebar places AI after Projects and opens Personas", async () => {
		const user = userEvent.setup();
		const { router } = renderApp({ path: "/all", actor: "dana" });
		// The shell paints a busy frame while it loads, and that frame carries
		// a sidebar of its own. The page heading marks the loaded shell.
		await screen.findByRole("heading", { name: "All tickets" });
		const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
		const ai = within(sidebar).getByRole("navigation", { name: "AI" });
		const link = within(ai).getByRole("link", { name: "Personas" });
		expect(link.getAttribute("href")).toBe("/ai/personas");
		expect(sidebar.textContent!.indexOf("AI")).toBeGreaterThan(sidebar.textContent!.indexOf("Projects"));
		await user.click(link);
		expect(await screen.findByRole("heading", { name: "Personas" })).toBeDefined();
		expect(router.state.location.pathname).toBe("/ai/personas");
		expect(link.getAttribute("aria-current")).toBe("page");
		expect(await screen.findByText("No personas yet")).toBeDefined();
	});

	test("create and edit persist across a fresh page mount", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const first = renderApp({ path: "/ai/personas", actor: "dana", server });
		await user.click(await screen.findByRole("button", { name: "New persona" }));
		const dialog = within(await screen.findByRole("dialog", { name: "New persona" }));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Reviewer");
		await user.type(dialog.getByRole("textbox", { name: "Instruction" }), "Check each claim.\nCite the file and line.");
		await user.click(dialog.getByRole("button", { name: "Create persona" }));
		expect(await screen.findByRole("heading", { name: "Reviewer" })).toBeDefined();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		const created = await server.client.personas.list({});
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ name: "Reviewer", instruction: "Check each claim.\nCite the file and line." });
		await user.click(screen.getByRole("button", { name: "Edit Reviewer" }));
		const editor = within(await screen.findByRole("dialog", { name: "Edit persona" }));
		const name = editor.getByRole("textbox", { name: "Name" });
		const instruction = editor.getByRole("textbox", { name: "Instruction" });
		expect((instruction as HTMLTextAreaElement).value).toBe(created[0]!.instruction);
		await user.clear(name);
		await user.type(name, "Builder");
		await user.clear(instruction);
		await user.type(instruction, "Write a failing test first.");
		await user.click(editor.getByRole("button", { name: "Save changes" }));
		expect(await screen.findByRole("heading", { name: "Builder" })).toBeDefined();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		first.unmount();
		renderApp({ path: "/ai/personas", actor: "dana", server });
		expect(await screen.findByRole("heading", { name: "Builder" })).toBeDefined();
		expect(await screen.findByText("Write a failing test first.")).toBeDefined();
		expect(await server.client.personas.list({})).toMatchObject([
			{ id: created[0]!.id, name: "Builder", instruction: "Write a failing test first." },
		]);
	});

	test("blank fields prevent a save and Cancel discards the draft", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/ai/personas", actor: "dana" });
		await user.click(await screen.findByRole("button", { name: "New persona" }));
		const dialog = within(await screen.findByRole("dialog", { name: "New persona" }));
		const save = dialog.getByRole("button", { name: "Create persona" }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Reviewer");
		await user.type(dialog.getByRole("textbox", { name: "Instruction" }), "   ");
		expect(save.disabled).toBe(true);
		expect(server.callsTo("personas.create")).toHaveLength(0);
		await user.click(dialog.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(screen.getByRole("button", { name: "New persona" }));
		const fresh = within(await screen.findByRole("dialog", { name: "New persona" }));
		expect((fresh.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("");
		expect(await server.client.personas.list({})).toEqual([]);
	});

	test("a failed save keeps the draft and permits a second attempt", async () => {
		const user = userEvent.setup();
		const { server } = renderApp({ path: "/ai/personas", actor: "dana" });
		await user.click(await screen.findByRole("button", { name: "New persona" }));
		const dialog = within(await screen.findByRole("dialog", { name: "New persona" }));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Reviewer");
		await user.type(dialog.getByRole("textbox", { name: "Instruction" }), "Check claims.");
		server.failNext("personas.create", { code: "INPUT_VALIDATION_FAILED", data: { issues: [] } });
		await user.click(dialog.getByRole("button", { name: "Create persona" }));
		expect(await dialog.findByRole("alert")).toBeDefined();
		expect((dialog.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Reviewer");
		expect(await server.client.personas.list({})).toEqual([]);
		await user.click(dialog.getByRole("button", { name: "Create persona" }));
		expect(await screen.findByRole("heading", { name: "Reviewer" })).toBeDefined();
	});

	test("a failed list offers Retry instead of the empty state", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		server.failNext("personas.list", { code: "INPUT_VALIDATION_FAILED", data: { issues: [] } });
		renderApp({ path: "/ai/personas", actor: "dana", server });
		expect(await screen.findByRole("alert")).toBeDefined();
		expect(screen.queryByText("No personas yet")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(await screen.findByText("No personas yet")).toBeDefined();
	});
});
