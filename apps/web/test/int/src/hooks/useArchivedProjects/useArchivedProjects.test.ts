import { describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { renderHookWithProviders } from "../../../../renderHook";
import { archiveProject } from "../../../../rows";
import { createTestServer } from "../../../../server";
import { useArchivedProjects } from "../../../../../src/hooks/useArchivedProjects/useArchivedProjects";

describe("hooks/useArchivedProjects", () => {
	test("an archived project and every project under it are read-only", async () => {
		const server = createTestServer();
		await archiveProject(server, "CDE");
		const { result } = renderHookWithProviders(() => useArchivedProjects(), undefined, {
			path: "/all",
			actor: "dana",
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
			actor: "dana",
		});
		expect(result.current.notice("CDE.web")).toBe("CDE/web is archived. Unarchive the project to change it.");
	});
});
