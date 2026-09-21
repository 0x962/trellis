import { GroupHeader } from "@trellis/ui";
import { type ReactNode, useId } from "react";

export type ReviewFactsProps = {
	// The one line the shut strip prints, from `factsLine`.
	line: string;
	shut: boolean;
	onToggle: () => void;
	// True while the window is narrower than 768 px.
	phone: boolean;
	children: ReactNode;
};

// Everything in the review that is not code: the merge conditions, the change
// summary, the review focus, the evidence, the checks and the threads. The
// strip starts shut, as the one line that `factsLine` writes, so the file tree
// and the diff under it start near the top of the sheet.
export function ReviewFacts({ line, shut, onToggle, phone, children }: ReviewFactsProps) {
	const id = useId();
	return (
		<section className="review-facts" aria-label="The facts">
			<GroupHeader
				group="facts"
				label="The facts"
				count={line}
				showCount="the facts"
				expanded={!shut}
				controls={id}
				phone={phone}
				onToggle={onToggle}
			/>
			{/* The box stays in the tree while the strip is shut, so the
			    `aria-controls` of the header always names a live element. A shut
			    strip draws no block. */}
			<div id={id} className="review-facts-blocks" hidden={shut}>
				{shut ? null : children}
			</div>
		</section>
	);
}
