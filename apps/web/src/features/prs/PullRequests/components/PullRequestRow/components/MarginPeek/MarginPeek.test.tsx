import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer } from "../../../../../../../../test/fake-server";
import { marginUp, restoreMargin } from "../../../../../../../../test/margin";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { callsTo, firstPr } from "../../../../../../../../test/prs";
import { renderWithProviders } from "../../../../../../../../test/renderWithProviders";
import { frames } from "../../../../../../../../test/ticketHost";
import { MarginPeek } from "./MarginPeek";

const label = "canary-technologies-corp/de #118";
const framed = "http://margin.localhost/https://github.com/canary-technologies-corp/de/pull/118";

const mount = async (server = createFakeServer()) => {
	const pr = await firstPr(server, "CDE-42");
	renderWithProviders(<MarginPeek pr={pr} />, { path: "/t/CDE-42", actor: "navid", server });
	return { server, pr };
};

const showDiff = () => screen.getByRole("button", { name: "Show diff" });
const sheet = () => screen.findByRole("dialog", { name: label });

beforeEach(() => {
	mockMatchMedia(false);
	marginUp();
});

afterEach(() => {
	restoreMargin();
});

describe("MarginPeek", () => {
	// PR-67. The diff belongs beside the ticket, so the control opens no tab
	// and leaves no page.
	test("offers Show diff as a button and not as a link to another tab", async () => {
		await mount();
		expect(screen.queryByRole("link", { name: "Show diff" })).toBeNull();
		const control = showDiff();
		expect(control.tagName).toBe("BUTTON");
		expect(control.getAttribute("target")).toBeNull();
	});

	// PR-68. margin holds the diff, the checks, and the review comments, so
	// the sheet gives margin the height of the window.
	test("opens a modal sheet that frames the margin page for the pull request", async () => {
		const user = userEvent.setup();
		await mount();
		await user.click(showDiff());
		const panel = await sheet();
		expect(panel.getAttribute("aria-modal")).toBe("true");
		expect(document.querySelector(".bg-scrim")).not.toBeNull();
		const frame = await within(panel).findByTitle(`${label} in margin`);
		expect(frame.getAttribute("src")).toBe(framed);
	});

	// PR-69. A cross-origin frame takes the key presses that land inside it,
	// so the close button is the control a person always reaches.
	test("the close button closes the sheet and takes the frame with it", async () => {
		const user = userEvent.setup();
		await mount();
		await user.click(showDiff());
		const panel = await sheet();
		await frames();
		await user.click(within(panel).getByRole("button", { name: "Close" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.queryByTitle(`${label} in margin`)).toBeNull();
	});

	// PR-70. margin renders the diff, so trellis asks the server for none.
	test("never asks the server for a diff", async () => {
		const user = userEvent.setup();
		const { server } = await mount();
		await user.click(showDiff());
		await sheet();
		expect(callsTo(server, "pullRequests.diff")).toHaveLength(0);
	});

	// PR-71. A ticket lists every pull request, and a frame per row would
	// load a margin page nobody asked for.
	test("frames no page until the person opens the sheet", async () => {
		await mount();
		await frames();
		expect(screen.queryByTitle(`${label} in margin`)).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
