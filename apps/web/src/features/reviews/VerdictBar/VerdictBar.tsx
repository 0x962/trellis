import type { ReviewRevision } from "@trellis/api";
import { MergeControl } from "./components/MergeControl";
import { unmetLine } from "./unmetLine/unmetLine";

// The bar at the bottom of the review page. It counts the draft threads and
// holds the verdict controls. The line under the controls names each unmet
// merge condition, and it is absent when every condition is met.
export function VerdictBar({
	pr,
	revision,
	drafts,
	unmet,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	drafts: number;
	// The phrases of `unmetConditions`, such as "1 check failed".
	unmet: readonly string[];
	onDone: () => void;
}) {
	const meta = revision.meta as { baseRefName?: string };
	const line = unmetLine(unmet);
	return (
		<section className="review-verdict-bar" aria-label="Verdict">
			<div className="review-verdict-bar-row">
				<span className="review-verdict-bar-text">{drafts === 1 ? "1 draft" : `${drafts} drafts`}</span>
				<MergeControl pr={pr} revision={revision} baseRefName={meta.baseRefName} unmet={unmet} onDone={onDone} />
			</div>
			{line && <p className="review-verdict-bar-unmet">{line}</p>}
		</section>
	);
}
