import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TrustedFolderSettings } from "./TrustedFolderSettings";

beforeEach(() => localStorage.clear());

const mount = async (server: FakeServer) => {
	const project = await server.client.projects.get({ project: "CDE" });
	return renderWithProviders(<TrustedFolderSettings project={project} />, {
		path: "/p/CDE/settings",
		actor: "navid",
		server,
	});
};

const callsTo = (server: FakeServer) =>
	server.calls.filter((entry) => entry.path.join(".") === "projects.setTrustedFolders");

describe("TrustedFolderSettings", () => {
	// The list is the permission trellis has to mark a folder trusted
	// before it starts an agent there.
	test("an empty project says its agents wait at the folder question", async () => {
		await mount(createFakeServer());
		expect(await screen.findByText(/No trusted folders/)).toBeDefined();
	});

	test("add sends the whole list, and remove sends the list without that folder", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await mount(server);
		await user.type(await screen.findByRole("textbox", { name: "Folder" }), "/Users/navid/projects/trellis");
		await user.click(screen.getByRole("button", { name: "Add folder" }));
		await waitFor(() =>
			expect(callsTo(server).at(-1)?.input).toEqual({
				project: "CDE",
				paths: ["/Users/navid/projects/trellis"],
			}),
		);

		const project = await server.client.projects.get({ project: "CDE" });
		expect(project.trustedFolders.map((folder) => folder.path)).toEqual(["/Users/navid/projects/trellis"]);
	});

	test("remove sends the list without the folder", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.projects.setTrustedFolders({ project: "CDE", paths: ["/src/web", "/src/api"] });
		await mount(server);
		await user.click(await screen.findByRole("button", { name: "Remove /src/web" }));
		await waitFor(() => expect(callsTo(server).at(-1)?.input).toEqual({ project: "CDE", paths: ["/src/api"] }));
	});

	// A relative path names no folder the runner can resolve, so the form
	// says so and calls nothing.
	test("a path that is not absolute is refused before the call", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await mount(server);
		await user.type(await screen.findByRole("textbox", { name: "Folder" }), "projects/trellis");
		await user.click(screen.getByRole("button", { name: "Add folder" }));
		expect(await screen.findByRole("alert")).toBeDefined();
		expect(callsTo(server)).toEqual([]);
	});
});
