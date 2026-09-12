import { gap, ticketTrail } from "../../../../../lib/ticketTrail";
import { useOpenTicket } from "../../../hooks/useOpenTicket";

export type ParentChipProps = {
	// Every ticket above this one, the top of the tree first.
	ancestors: readonly string[];
	// The title of the immediate parent, for the end of the trail.
	title: string;
};

// The trail that leads to this ticket, such as OP-4 → OP-6, ending at its
// parent with the parent's title. A tree deeper than three keeps the top of
// the tree and the parent and stands the rest in for one gap mark, the same
// way a board card does. A click opens that ticket in the same surface.
export function ParentChip({ ancestors, title }: ParentChipProps) {
	const open = useOpenTicket();
	const trail = ticketTrail(ancestors.slice(0, -1), ancestors[ancestors.length - 1] ?? "");
	return (
		<fieldset
			aria-label="Parent trail"
			className="inline-flex h-7 min-w-0 max-w-80 shrink items-center gap-1 rounded-sm border border-border bg-surface px-1.5 text-xs text-fg-muted"
		>
			{trail.map((step, index) => (
				<span key={step} className="inline-flex min-w-0 items-center gap-1">
					{index > 0 && (
						<span aria-hidden="true" className="text-fg-faint">
							→
						</span>
					)}
					{step === gap ? (
						<span aria-hidden="true" className="shrink-0 font-mono text-kbd">
							{gap}
						</span>
					) : (
						<button
							type="button"
							onClick={() => open(step)}
							className="shrink-0 cursor-pointer rounded-sm font-mono text-kbd transition duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
						>
							{step}
						</button>
					)}
				</span>
			))}
			<span className="truncate font-mono">{title}</span>
		</fieldset>
	);
}
