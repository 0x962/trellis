import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { callsTo } from "../../../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { createTestServer } from "../../../../../../../../test/server";
import { DiffLink } from "./DiffLink";

const url = "https://github.com/acme/web/pull/118";

beforeEach(() => {
	mockMatchMedia(false);
});

describe("DiffLink", () => {
	// PR-28
	test("opens the default diff of the pull request in a new tab", async () => {
		const server = createTestServer();
		renderWithProviders(<DiffLink url={url} />, { path: "/t/CDE-42", actor: "navid", server });
		const link = await screen.findByRole("link", { name: "Show diff" });
		expect(link.getAttribute("href")).toBe(`${url}/files`);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	// The setting names the viewer, so a viewer on this machine takes the
	// whole pull request URL after its own origin.
	test("the diff URL template of the settings names the viewer", async () => {
		const server = createTestServer({
			prepare: async (client) => {
				const settings = await client.settings.get();
				await client.settings.set({ ...settings, diffUrlTemplate: "http://margin.localhost/{url}" });
			},
		});
		renderWithProviders(<DiffLink url={url} />, { path: "/t/CDE-42", actor: "navid", server });
		const link = await screen.findByRole("link", { name: "Show diff" });
		expect(link.getAttribute("href")).toBe(`http://margin.localhost/${url}`);
	});

	// PR-29. The viewer renders the diff, so trellis asks the server for none.
	test("never asks the server for a diff", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		renderWithProviders(<DiffLink url={url} />, { path: "/t/CDE-42", actor: "navid", server });
		await user.click(await screen.findByRole("link", { name: "Show diff" }));
		expect(callsTo(server, "pullRequests.diff")).toHaveLength(0);
	});
});
