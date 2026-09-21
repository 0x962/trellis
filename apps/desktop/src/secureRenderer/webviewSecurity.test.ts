import { describe, expect, test } from "bun:test";
import { LINK_BROWSER_PARTITION, secureLinkBrowser } from "./webviewSecurity.ts";

const apply = (src: string) => {
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
		const result = apply("https://github.com/0x962/trellis/pull/215");

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

	test("refuses an HTTP page", () => {
		expect(apply("http://example.com").refused).toBe(true);
	});

	test("refuses a URL that does not parse", () => {
		expect(apply("not a URL").refused).toBe(true);
	});
});
