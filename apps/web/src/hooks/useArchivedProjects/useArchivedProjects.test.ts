import { describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "../../../test/renderHook";
import { archiveProject } from "../../../test/rows";
import { createTestServer } from "../../../test/server";
import { useArchivedProjects } from "./useArchivedProjects";

describe("hooks/useArchivedProjects", () => {
	test("an archived project and every project under it are read-only", async () => {
		const server = createTestServer();
		await archiveProject(server, "CDE");
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
