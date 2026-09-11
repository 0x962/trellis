import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, type FakeServer } from "../../../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { callsTo, gatedServer } from "../../../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { DiffLink } from "./DiffLink";

const url = "https://github.com/acme/web/pull/118";
const title = "Restore the fork pages";

beforeEach(() => {
	mockMatchMedia(false);
});

const renderLink = (server: FakeServer, wired: FakeServer = server) =>
	renderWithProviders(<DiffLink url={url}>{title}</DiffLink>, { path: "/t/CDE-42", actor: "navid", server: wired });

describe("DiffLink", () => {
	// PR-28
	test("opens the default diff of the pull request in a new tab", async () => {
		const server = createFakeServer();
		renderLink(server);
		const link = await screen.findByRole("link", { name: title });
		expect(link.getAttribute("href")).toBe(`${url}/files`);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	// PR-30. The link covers the card it sits in, so a click anywhere on the
	// card opens the diff.
	test("covers the card it sits in", async () => {
		const server = createFakeServer();
		renderLink(server);
		const link = await screen.findByRole("link", { name: title });
		expect(link.getAttribute("class")).toContain("before:absolute");
		expect(link.getAttribute("class")).toContain("before:inset-0");
	});

	// The setting names the viewer, so a viewer on this machine takes the
	// whole pull request URL after its own origin.
	test("the diff URL template of the settings names the viewer", async () => {
		const server = createFakeServer();
		server.state.settings.diffUrlTemplate = "http://margin.localhost/{url}";
		renderLink(server);
		const link = await screen.findByRole("link", { name: title });
		expect(link.getAttribute("href")).toBe(`http://margin.localhost/${url}`);
	});

	// PR-64. The title holds its place while the settings load, so the card
	// never moves when the viewer name arrives.
	test("shows the title before the settings answer", async () => {
		const server = createFakeServer();
		const gate = gatedServer(server);
		gate.hold();
		renderLink(server, gate.server);
		expect(await screen.findByText(title)).toBeDefined();
		expect(screen.queryByRole("link")).toBeNull();
		gate.release();
		expect(await screen.findByRole("link", { name: title })).toBeDefined();
	});

	// PR-29. The viewer renders the diff, so trellis asks the server for none.
	test("never asks the server for a diff", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		renderLink(server);
		await user.click(await screen.findByRole("link", { name: title }));
		expect(callsTo(server, "pullRequests.diff")).toHaveLength(0);
	});
});
