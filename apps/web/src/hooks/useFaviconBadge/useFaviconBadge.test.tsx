import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import { createFakeServer } from "../../../test/fake-server";
import { mockMatchMedia } from "../../../test/media";
import { renderApp } from "../../../test/renderWithProviders";
import { needsYouCount } from "../../features/needs-you/utils/needsYouCount";
import { badgeLabel } from "./useFaviconBadge";

// happy-dom has no 2D canvas. The fake context records what the badge
// draws, and the canvas answers with a fixed data URL.
const drawn: string[] = [];
const original = {
	getContext: HTMLCanvasElement.prototype.getContext,
	toDataURL: HTMLCanvasElement.prototype.toDataURL,
};

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	drawn.length = 0;
	const record =
		(name: string) =>
		(...args: unknown[]) =>
			drawn.push(`${name}:${args.join(",")}`);
	HTMLCanvasElement.prototype.getContext = (() =>
		new Proxy({}, { get: (_target, name) => record(String(name)), set: () => true })) as never;
	HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,badge";
	document.head.querySelectorAll("link[rel~=icon]").forEach((link) => link.remove());
	const link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/svg+xml";
	link.href = "/favicon.svg";
	document.head.appendChild(link);
});

afterEach(() => {
	HTMLCanvasElement.prototype.getContext = original.getContext;
	HTMLCanvasElement.prototype.toDataURL = original.toDataURL;
});

const icon = () => document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!;

describe("hooks/useFaviconBadge", () => {
	test("the badge prints the count up to 9 and a dot above 9", () => {
		expect(badgeLabel(0)).toBeNull();
		expect(badgeLabel(3)).toBe("3");
		expect(badgeLabel(9)).toBe("9");
		expect(badgeLabel(10)).toBe("");
	});

	// The tab icon follows the same inbox query as the sidebar badge.
	test("the favicon carries the Needs you count and returns to the plain mark at 0", async () => {
		const server = createFakeServer();
		const count = needsYouCount(await server.client.inbox.get({}));
		expect(count).toBeGreaterThan(0);
		const { queryClient, orpc } = renderApp({ path: "/all", actor: "navid", server });
		await waitFor(() => expect(icon().getAttribute("href")).toBe("data:image/png;base64,badge"));
		expect(icon().type).toBe("image/png");
		const label = badgeLabel(count)!;
		if (label !== "") expect(drawn.some((call) => call.startsWith(`fillText:${label},`))).toBe(true);
		const empty = await createFakeServer({ empty: true }).client.inbox.get({});
		act(() => queryClient.setQueryData(orpc.inbox.get.queryKey({ input: {} }), empty));
		await waitFor(() => expect(icon().getAttribute("href")).toBe("/favicon.svg"));
		expect(icon().type).toBe("image/svg+xml");
	});
});
