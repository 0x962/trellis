import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../../../../../../media";
import { callsTo } from "../../../../../../../../../prs";
import { renderWithProviders } from "../../../../../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../../../../../server";
import { DiffLink } from "../../../../../../../../../../src/features/prs/PullRequests/components/PullRequestRow/components/DiffLink/DiffLink";

const url = "https://github.com/acme/web/pull/118";
const title = "Restore the fork pages";

beforeEach(() => {
	mockMatchMedia(false);
});

const renderLink = (server: TestServer) =>
	renderWithProviders(<DiffLink url={url}>{title}</DiffLink>, { path: "/t/CDE-42", actor: "dana", server });

describe("DiffLink", () => {
	// PR-28
	test("opens the default diff of the pull request in a new tab", async () => {
		const server = createTestServer();
		renderLink(server);
		const link = await screen.findByRole("link", { name: title });
		expect(link.getAttribute("href")).toBe(`${url}/files`);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	// PR-30. The link covers the card it sits in, so a click anywhere on the
	// card opens the diff.
	test("covers the card it sits in", async () => {
		const server = createTestServer();
		renderLink(server);
		const link = await screen.findByRole("link", { name: title });
		expect(link.getAttribute("class")).toContain("before:absolute");
		expect(link.getAttribute("class")).toContain("before:inset-0");
	});

	// The setting names the viewer, so a viewer on this machine takes the
	// whole pull request URL after its own origin.
	test("the diff URL template of the settings names the viewer", async () => {
		const server = createTestServer({
			prepare: async (client) => {
				const settings = await client.settings.get();
				await client.settings.set({ ...settings, diffUrlTemplate: "http://diff.localhost/{url}" });
			},
		});
		renderLink(server);
		const link = await screen.findByRole("link", { name: title });
		expect(link.getAttribute("href")).toBe(`http://diff.localhost/${url}`);
	});

	// PR-29. The viewer renders the diff, so trellis asks the server for none.
	test("never asks the server for a diff", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		renderLink(server);
		await user.click(await screen.findByRole("link", { name: title }));
		expect(callsTo(server, "pullRequests.diff")).toHaveLength(0);
	});
});
