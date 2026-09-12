import { afterEach, beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { mockMatchMedia } from "../../../../media";
import { renderApp } from "../../../../renderWithProviders";
import { createTestServer } from "../../../../server";

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
	for (const link of document.head.querySelectorAll("link[rel~=icon]")) link.remove();
	const link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/svg+xml";
	link.href = "/favicon.svg";
	document.head.appendChild(link);
});

afterEach(() => {
	HTMLCanvasElement.prototype.getContext = original.getContext;
	HTMLCanvasElement.prototype.toDataURL = original.toDataURL;
	for (const link of document.head.querySelectorAll("link[rel~=icon]")) link.remove();
});

const icon = () => document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!;

test("the favicon stays plain when review tickets exist", async () => {
	const server = createTestServer();
	renderApp({ path: "/needs-you", actor: "dana", server });
	await screen.findByRole("heading", { name: "Needs you" });
	expect(icon().getAttribute("href")).toBe("/favicon.svg");
	expect(icon().type).toBe("image/svg+xml");
	expect(drawn).toHaveLength(0);
});
