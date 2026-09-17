import { cx } from "@trellis/ui";
import type { MentionCandidate } from "../mentionQuery";

export type MentionListProps = {
	candidates: readonly MentionCandidate[];
	selected: number;
	onPick: (candidate: MentionCandidate) => void;
	onHover: (index: number) => void;
};

// The completions for the `@` token under the caret, above the composer.
// Arrow keys move the selection, Enter or Tab picks it, Escape closes it.
export function MentionList({ candidates, selected, onPick, onHover }: MentionListProps) {
	return (
		<div
			role="listbox"
			aria-label="Mention"
			className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-80 max-w-full overflow-y-auto rounded-md border border-border bg-elevated p-1 shadow-md"
		>
			{candidates.map((candidate, index) => (
				<button
					key={candidate.id}
					type="button"
					role="option"
					aria-selected={index === selected}
					onMouseEnter={() => onHover(index)}
					onMouseDown={(event) => {
						event.preventDefault();
						onPick(candidate);
					}}
					className={cx(
						"flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-base text-fg",
						index === selected && "bg-bg",
					)}
				>
					<span className="min-w-0 flex-1 truncate">@{candidate.label}</span>
					{candidate.hint !== undefined && (
						<span className="shrink-0 truncate font-mono text-xs text-fg-faint">{candidate.hint}</span>
					)}
				</button>
			))}
		</div>
	);
}
