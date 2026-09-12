import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";
import { ProjectPicker } from "../../../../../../src/features/pickers/ProjectPicker/ProjectPicker";

// Two roots: CDE with web (and web/auth) and host, and TRL.
const server = createTestServer();
await server.client.projects.create({ parent: "CDE.web", name: "auth" });
const projects = await server.client.projects.list({});

const pathOf = (option: Element) => `${option.textContent ?? ""} ${option.getAttribute("data-hint") ?? ""}`;

describe("features/pickers/ProjectPicker", () => {
	// Outcome 86
	test("renders the project tree and applies a project by path", async () => {
		const user = userEvent.setup();
		const onPick = mock((_ref: string) => {});
		renderWithProviders(
			<ProjectPicker projects={projects} onPick={onPick} trigger={<button type="button">Project</button>} />,
			{ path: "/p/CDE", actor: "dana", server },
		);
		await user.click(screen.getByRole("button", { name: "Project" }));
		const dialog = await screen.findByRole("dialog");
		const options = within(dialog).getAllByRole("option");
		expect(options.map((option) => option.getAttribute("data-depth"))).toEqual(["0", "1", "2", "1", "0"]);
		expect(options.map(pathOf).map((text) => text.trim())).toEqual([
			expect.stringContaining("CDE"),
			expect.stringContaining("CDE/web"),
			expect.stringContaining("CDE/web/auth"),
			expect.stringContaining("CDE/host"),
			expect.stringContaining("TRL"),
		]);
		await user.keyboard("web/auth");
		await waitFor(() => expect(within(dialog).getAllByRole("option")).toHaveLength(1));
		await user.keyboard("{Enter}");
		expect(onPick).toHaveBeenCalledWith("CDE.web.auth");
	});
});
