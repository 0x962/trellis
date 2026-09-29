import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { LINK_BROWSER_PARTITION } from "@trellis/api";
import { secureLinkBrowser } from "./secureLinkBrowser.ts";

afterEach(() => mock.restore());

const attachWebview = (src: string) => {
	let refused = false;
	const preferences: { preload?: string; nodeIntegration?: boolean; sandbox?: boolean; partition?: string } = {
		preload: "/tmp/remote.cjs",
		nodeIntegration: true,
		sandbox: false,
		partition: "shared",
	};
	const params: { src?: string; preload?: string; partition?: string; allowpopups?: string } = {
		src,
		preload: "/tmp/remote.cjs",
		partition: "shared",
		allowpopups: "",
	};
	secureLinkBrowser(
		{
			preventDefault: () => {
				refused = true;
			},
		},
		preferences,
		params,
	);
	return { refused, preferences, params };
};

describe("secureLinkBrowser", () => {
	test("allows an HTTPS page with the fixed isolated preferences", () => {
		const result = attachWebview("https://github.com/0x962/trellis/pull/215");

		expect(result.refused).toBe(false);
		expect(result.preferences).toEqual({
			nodeIntegration: false,
			sandbox: true,
			partition: LINK_BROWSER_PARTITION,
		});
		expect(result.params).toEqual({
			src: "https://github.com/0x962/trellis/pull/215",
			partition: LINK_BROWSER_PARTITION,
		});
	});

	test("allows an HTTP page", () => {
		expect(attachWebview("http://example.com").refused).toBe(false);
	});

	test("refuses a URL that does not parse", () => {
		expect(attachWebview("not a URL").refused).toBe(true);
	});
});

test.each([
	"file:///etc/passwd",
	"javascript:alert(1)",
	"https://user:pass@example.com",
	"trellis://page/01M3GHKCN2JY8QMTZ17TP3RHYG",
])("rejects %s", (url) => {
	expect(attachWebview(url).refused).toBe(true);
});

test("omits credentials and private URL fields from rejection logs", () => {
	const warning = spyOn(console, "warn").mockImplementation(() => {});
	expect(
		attachWebview("https://private-user:private-password@example.com/private-path?token=private-token").refused,
	).toBe(true);
	expect(warning).toHaveBeenCalledTimes(1);
	expect(JSON.stringify(warning.mock.calls)).not.toContain("private-");
});
