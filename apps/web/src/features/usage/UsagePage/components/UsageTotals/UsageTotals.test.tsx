import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { usageReport } from "../../../../../stories/pages/fixtures/usage";
import { UsageTotals } from "./UsageTotals";

test("cost details preserve measured zero and explain approximate prices and token classes", () => {
	const html = renderToStaticMarkup(
		<UsageTotals
			totals={{ ...usageReport.totals, usd: 0, trellisUsd: 0, approximate: true }}
			pricingDate="2026-09-30"
		/>,
	);
	expect(html).toContain("~$0");
	expect(html).toContain("Some prices are approximate.");
	expect(html).toContain("2026-09-30");
	expect(html).toContain("Cache savings");
	expect(html).toContain("330,000");
	expect(html).toContain("Reasoning output is part of output.");
	expect(html).toContain("Reported harness costs are excluded.");
	expect(html).not.toContain("Not available");
});
