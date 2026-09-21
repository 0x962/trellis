import { Popover } from "@trellis/ui";

const label = (count: number) => `${count} ${count === 1 ? "condition" : "conditions"} unmet`;

// The count of the merge conditions that the pull request does not meet. A
// click opens the list of them. The card holds one line, so the list never
// prints inline.
export function UnmetConditions({ unmet }: { unmet: readonly string[] }) {
	if (unmet.length === 0) return null;
	return (
		<Popover
			side="top"
			align="end"
			label="The unmet conditions"
			trigger={
				<button type="button" className="review-unmet-trigger">
					{label(unmet.length)}
				</button>
			}
		>
			<ul className="review-unmet-list">
				{unmet.map((condition) => (
					<li key={condition}>{condition}</li>
				))}
			</ul>
		</Popover>
	);
}
