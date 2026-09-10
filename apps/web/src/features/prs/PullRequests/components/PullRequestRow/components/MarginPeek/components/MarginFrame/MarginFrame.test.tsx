import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { createFakeServer } from "../../../../../../../../../../test/fake-server";
import { marginDown, marginSilent, marginUp, restoreMargin } from "../../../../../../../../../../test/margin";
import { mockMatchMedia } from "../../../../../../../../../../test/media";
import { renderWithProviders } from "../../../../../../../../../../test/renderWithProviders";
import { MarginFrame } from "./MarginFrame";

const url = "https://github.com/canary-technologies-corp/de/pull/118";
const label = "canary-technologies-corp/de #118";
const framed = `http://margin.localhost/${url}`;

const mount = () =>
	renderWithProviders(<MarginFrame url={url} label={label} />, {
		path: "/t/CDE-42",
		actor: "navid",
		server: createFakeServer(),
	});

beforeEach(() => {
	mockMatchMedia(false);
});

afterEach(() => {
	restoreMargin();
});

describe("MarginFrame", () => {
	// PR-64. margin draws the diff on this machine, so trellis frames the
	// margin page and renders no diff of its own.
	test("frames the margin page for the pull request", async () => {
		marginUp();
		mount();
		const frame = await screen.findByTitle(`${label} in margin`);
		expect(frame.tagName).toBe("IFRAME");
		expect(frame.getAttribute("src")).toBe(framed);
	});

	// PR-65. margin runs as a local service. When it is down the frame shows
	// the browser's own error page, which says nothing about margin. The
	// message takes the place of that frame.
	test("names the margin URL when margin does not answer", async () => {
		marginDown();
		mount();
		const link = await screen.findByRole("link", { name: framed });
		await waitFor(() => expect(screen.queryByTitle(`${label} in margin`)).toBeNull());
		expect(link.getAttribute("href")).toBe(framed);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
		expect(screen.getByText(/margin does not answer/)).toBeDefined();
		expect(screen.queryByTitle(`${label} in margin`)).toBeNull();
	});

	// PR-66. The reply of a cross-origin request reads as nothing at all, so
	// the request asks margin's own page and never the pull request page,
	// which would make margin call GitHub for a diff nobody reads. Chromium
	// holds such a reply for seconds, so the frame goes up before it lands.
	test("frames the page while it asks margin's own origin once", async () => {
		const calls = marginSilent();
		mount();
		const frame = await screen.findByTitle(`${label} in margin`);
		expect(frame.getAttribute("src")).toBe(framed);
		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]!.url).toBe("http://margin.localhost/");
		expect(calls[0]!.mode).toBe("no-cors");
		expect(screen.queryByText(/margin does not answer/)).toBeNull();
	});
});
