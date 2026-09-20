import { Checkbox } from "../../primitives/Checkbox";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";

export type ReviewFocusListProps = {
	sentences: readonly string[];
	held: readonly boolean[];
	onToggle: (index: number, hold: boolean) => void;
};

export function ReviewFocusList({ sentences, held: holdStates, onToggle }: ReviewFocusListProps) {
	const heldCount = sentences.reduce((count, _sentence, index) => count + Number(holdStates[index] ?? false), 0);
	const numberedSentences = sentences.map((sentence, index) => ({ key: `${index}:${sentence}`, sentence, index }));

	return (
		<section aria-label="Review focus" className="flex flex-col gap-2">
			<SectionHeader
				title="Review focus"
				actions={
					<span className="tabular" role="status" aria-live="polite">
						{heldCount} of {sentences.length} held
					</span>
				}
			/>
			{sentences.length === 0 ? (
				<EmptyState description="The ticket names no review focus." />
			) : (
				<>
					<ul className="flex flex-col gap-2">
						{numberedSentences.map((numbered) => (
							<li key={numbered.key}>
								<Checkbox
									label={numbered.sentence}
									checked={holdStates[numbered.index] ?? false}
									onCheckedChange={(next) => onToggle(numbered.index, next)}
								/>
							</li>
						))}
					</ul>
					<p className="text-sm text-fg-faint">Held marks clear on each new revision.</p>
				</>
			)}
		</section>
	);
}
