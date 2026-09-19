import { expect, test } from "bun:test";
import { checkStatusIndicator } from "./reviewTabStatus";

test("labels pending and neutral checks without a passed claim", () => {
	expect(checkStatusIndicator("pending")).toEqual({ label: "Checks pending", tone: "warning" });
	expect(checkStatusIndicator("neutral")).toEqual({ label: "Checks completed", tone: "neutral" });
	expect(checkStatusIndicator("canceled")).toEqual({ label: "Checks canceled", tone: "neutral" });
	expect(checkStatusIndicator("unknown")).toEqual({ label: "Check status unavailable", tone: "neutral" });
});
