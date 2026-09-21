import { type Check, CheckRibbon } from "../../../../domain/CheckRibbon";
import { Section } from "../../Section";

const ribbon = (buckets: Check["bucket"][]) => buckets.map((bucket, index) => ({ name: `check ${index + 1}`, bucket }));

const passing = ribbon(["pass", "pass", "pass", "pass", "pass", "pass"]);
const mixed = ribbon(["pass", "fail", "pass", "pending", "pending"]);
const allStates = ribbon(["pass", "fail", "pending", "skipping"]);
const queued = ribbon(["pending", "pending", "pending", "pending"]);
const skipped = ribbon(["pass", "pass", "skipping", "pass"]);
// 40 checks with one failure: the gaps close and every segment stays visible.
const crowded = ribbon(Array.from({ length: 40 }, (_, index) => (index === 19 ? "fail" : "pass")));
// 80 checks with one failure: more checks than px, so the ribbon draws runs.
const packed = ribbon(Array.from({ length: 80 }, (_, index) => (index === 39 ? "fail" : "pass")));

export function CheckRibbonSection() {
	return (
		<Section name="CheckRibbon" note="full and mini; passed, failed, pending, skipped; 40 and 80 checks">
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={passing} /> 6 passed
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={mixed} /> 1 failed, 2 pending
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={allStates} /> passed, failed, pending, skipped
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={queued} /> queued
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={skipped} /> 1 skipped
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon size="mini" checks={passing} /> mini
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon size="mini" checks={mixed} /> mini
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={crowded} /> 40 checks, 1 failed
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon size="mini" checks={crowded} /> mini, 40 checks
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-fg-muted">
				<CheckRibbon checks={packed} /> 80 checks, 1 failed
			</span>
		</Section>
	);
}
