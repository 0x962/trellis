import { expect, test } from "bun:test";
import { captureInput } from "./kinds.ts";

test("a capture record holds both SHAs and the capture facts", () => {
	const input = captureInput({
		id: "01M305F0YWET001AED2TE7AZT2",
		evidenceId: "01M3089QDPCZA0QPNTZ2MWVX0V",
		headSha: "head-sha",
		baseSha: "base-sha",
		route: "/reviews/170",
		viewport: "1440x900",
		theme: "dark",
		seed: "bun run seed",
		browser: "Aside",
		capturedAt: "2026-09-20T20:32:08.114Z",
	});

	expect(input).toEqual({
		id: "01M305F0YWET001AED2TE7AZT2",
		evidenceId: "01M3089QDPCZA0QPNTZ2MWVX0V",
		headSha: "head-sha",
		kind: "capture",
		record: {
			headSha: "head-sha",
			baseSha: "base-sha",
			route: "/reviews/170",
			viewport: "1440x900",
			theme: "dark",
			seed: "bun run seed",
			browser: "Aside",
			capturedAt: "2026-09-20T20:32:08.114Z",
		},
	});
});
