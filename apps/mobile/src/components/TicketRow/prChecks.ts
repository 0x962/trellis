import type { TicketSummary } from "@trellis/api";
import type { Check, CheckBucket } from "../CheckRibbon";

// TicketSummary stores check counts, but CheckRibbon renders one segment for
// each check. Keep the pass, fail, and pending order in the generated segments.
const run = (count: number, bucket: CheckBucket): Check[] =>
	Array.from({ length: count }, () => ({ name: "check", bucket }));

export const prChecks = (pr: NonNullable<TicketSummary["pr"]>): Check[] => [
	...run(pr.pass, "pass"),
	...run(pr.fail, "fail"),
	...run(pr.pending, "pending"),
];
