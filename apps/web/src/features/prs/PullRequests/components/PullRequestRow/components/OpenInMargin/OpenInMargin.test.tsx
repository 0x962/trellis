import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../../../../../test/fake-server";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { callsTo } from "../../../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { OpenInMargin } from "./OpenInMargin";

const url = "https://github.com/canary-technologies-corp/de/pull/118";

beforeEach(() => {
	mockMatchMedia(false);
});

describe("OpenInMargin", () => {
	// PR-28
	test("opens margin at the pull request URL in a new tab", async () => {
		const server = createFakeServer();
		renderWithProviders(<OpenInMargin url={url} />, { path: "/t/CDE-42", actor: "navid", server });
		const link = await screen.findByRole("link", { name: "Show diff" });
		expect(link.getAttribute("href")).toBe(`http://margin.localhost/${url}`);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	// PR-29. margin renders the diff, so trellis asks the server for none.
	test("never asks the server for a diff", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		renderWithProviders(<OpenInMargin url={url} />, { path: "/t/CDE-42", actor: "navid", server });
		await user.click(await screen.findByRole("link", { name: "Show diff" }));
		expect(callsTo(server, "pullRequests.diff")).toHaveLength(0);
	});
});
