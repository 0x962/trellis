import type { ReviewRevision } from "@trellis/api";
import { MergeButton } from "./components/MergeButton";
import { unmetLine } from "./unmetText/unmetText";

// The sentence that stands in place of `Merge` on a phone. A merge writes to
// a company repository and cannot be undone from the page, so the person does
// it at a computer.
const deskLine = "A merge into an enterprise repository needs the desk.";

export function VerdictBar({
	pr,
	revision,
	openThreads,
	unmetConditions,
	phone,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	openThreads: number;
	unmetConditions: readonly string[];
	// True while the window is narrower than 768 px.
	phone: boolean;
	onDone: () => void;
}) {
	const meta = revision.meta as { baseRefName?: string };
	// The unmet conditions say why a merge waits. A phone offers no merge, so
	// the bar prints the reason for that in the same place.
	const line = phone ? deskLine : unmetLine(unmetConditions);
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			<div className="review-verdict-bar-row">
				<span className="review-verdict-bar-threads">
					{openThreads} open {openThreads === 1 ? "thread" : "threads"}
				</span>
				{!phone && (
					<MergeButton
						pr={pr}
						revision={revision}
						baseRefName={meta.baseRefName}
						unmetConditions={unmetConditions}
						onDone={onDone}
					/>
				)}
			</div>
			{line && <p className="review-verdict-bar-unmet">{line}</p>}
		</section>
	);
}
