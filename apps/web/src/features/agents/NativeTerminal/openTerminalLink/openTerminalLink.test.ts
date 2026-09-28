import { describe, expect, mock, test } from "bun:test";
import { internalLinkTypes } from "@trellis/api";
import { openTerminalLink } from "./openTerminalLink";

const id = "01M3GHKCN2JY8QMTZ17TP3RHYG";
const setup = () => ({
	resolve: mock(async () => ({ href: "/p/TRL/pages/query-inventory" })),
	navigate: mock(async (_href: string) => {}),
	openWebLink: mock((_url: string) => {}),
});

describe("terminal links", () => {
	test.each([...internalLinkTypes])("resolves a %s link inside Trellis", async (type) => {
		const deps = setup();
		const link = `trellis://${type}/${id}`;
		await openTerminalLink(link, deps);
		expect(deps.resolve).toHaveBeenCalledWith({ link });
		expect(deps.navigate).toHaveBeenCalledWith("/p/TRL/pages/query-inventory");
		expect(deps.openWebLink).not.toHaveBeenCalled();
	});

	test.each(["https://github.com/0x962/trellis/pull/496", "http://localhost:4521/t/TRL-638"])(
		"uses the app web-link opener for %s",
		async (url) => {
			const deps = setup();
			await openTerminalLink(url, deps);
			expect(deps.openWebLink).toHaveBeenCalledWith(url);
			expect(deps.resolve).not.toHaveBeenCalled();
			expect(deps.navigate).not.toHaveBeenCalled();
		},
	);

	test.each([
		"javascript:alert(1)",
		"file:///etc/passwd",
		"data:text/html,hello",
		"https://person:secret@example.com",
		"not a URL",
		"trellis://page/missing",
		`trellis://unknown/${id}`,
		`trellis://page/${id}?version=1`,
		`trellis://page/${id}/extra`,
		`trellis://person:secret@page/${id}`,
	])("refuses %s", async (url) => {
		const deps = setup();
		await openTerminalLink(url, deps);
		expect(deps.resolve).not.toHaveBeenCalled();
		expect(deps.navigate).not.toHaveBeenCalled();
		expect(deps.openWebLink).not.toHaveBeenCalled();
	});

	test("returns a missing-record error to the caller without external navigation", async () => {
		const deps = setup();
		deps.resolve.mockRejectedValue(new Error("This page does not exist or is unavailable."));
		await expect(openTerminalLink(`trellis://page/${id}`, deps)).rejects.toThrow("This page does not exist");
		expect(deps.navigate).not.toHaveBeenCalled();
		expect(deps.openWebLink).not.toHaveBeenCalled();
	});
});
