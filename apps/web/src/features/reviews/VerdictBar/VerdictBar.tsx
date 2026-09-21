import type { ReviewRevision } from "@trellis/api";
import { MergeButton } from "./components/MergeButton";
import { unmetLine } from "./unmetText/unmetText";

export function VerdictBar({
	pr,
	revision,
	openThreads,
	unmetConditions,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	openThreads: number;
	unmetConditions: readonly string[];
	onDone: () => void;
}) {
	const meta = revision.meta as { baseRefName?: string };
	const line = unmetLine(unmetConditions);
	return (
		<section className="review-bar review-verdict-bar" aria-label="Verdict">
			<div className="review-verdict-bar-row">
				<span className="review-verdict-bar-threads">
					{openThreads} open {openThreads === 1 ? "thread" : "threads"}
				</span>
				<MergeButton
					pr={pr}
					revision={revision}
					baseRefName={meta.baseRefName}
					unmetConditions={unmetConditions}
					onDone={onDone}
				/>
			</div>
			{line && <p className="review-verdict-bar-unmet">{line}</p>}
		</section>
	);
}
