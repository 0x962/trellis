import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lastCallTo } from "../../../../../inbox";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createUiStore, useUiStore } from "../../../../../../src/stores/uiStore";
import { ProjectTree } from "../../../../../../src/features/sidebar/ProjectTree";

beforeEach(() => {
	localStorage.clear();
	useUiStore.setState(createUiStore().getState());
});

describe("features/sidebar/ProjectRowActions", () => {
	test("the row menu has Archive and Delete, and Archive archives the project", async () => {
		const user = userEvent.setup();
		const { server } = renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		await user.click(await screen.findByRole("button", { name: "Actions for trellis" }));
		expect(await screen.findByRole("menuitem", { name: "Archive" })).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "Delete…" })).toBeDefined();
		await user.click(screen.getByRole("menuitem", { name: "Archive" }));
		await waitFor(() =>
			expect(lastCallTo(server, "projects.update")?.input).toEqual({ project: "TRL", archived: true }),
		);
	});

	test("Delete in the row menu opens the delete confirmation", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ProjectTree />, { path: "/all", actor: "dana" });
		await user.click(await screen.findByRole("button", { name: "Actions for trellis" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete trellis?" });
		expect(await within(dialog).findByRole("textbox", { name: "Type TRL to confirm" })).toBeDefined();
	});
});
