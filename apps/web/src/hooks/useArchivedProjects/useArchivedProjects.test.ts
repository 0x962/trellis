import { describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { createFakeServer } from "../../../test/fake-server";
import { renderHookWithProviders } from "../../../test/renderHook";
import { useArchivedProjects } from "./useArchivedProjects";

const archive = (server: ReturnType<typeof createFakeServer>, key: string) => {
	const project = [...server.state.projects.values()].find((entry) => entry.path === key)!;
	project.archivedAt = new Date().toISOString();
};

describe("hooks/useArchivedProjects", () => {
	test("an archived project and every project under it are read-only", async () => {
		const server = createFakeServer();
		archive(server, "CDE");
		const { result } = renderHookWithProviders(() => useArchivedProjects(), undefined, {
			path: "/all",
			actor: "navid",
			server,
		});
		await waitFor(() => expect(result.current.isArchived("CDE")).toBe(true));
		expect(result.current.isArchived("CDE.web")).toBe(true);
		expect(result.current.isArchived("TRL")).toBe(false);
		// A key that starts with another key is a different project.
		expect(result.current.isArchived("CDEX")).toBe(false);
	});

	test("the notice names the archived project and the way out", async () => {
		const { result } = renderHookWithProviders(() => useArchivedProjects(), undefined, {
			path: "/all",
			actor: "navid",
		});
		expect(result.current.notice("CDE.web")).toBe("CDE/web is archived. Unarchive the project to change it.");
	});
});
