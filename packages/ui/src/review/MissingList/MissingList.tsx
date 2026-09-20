import { BlockRow } from "../BlockRow";
import { CopyLine } from "../CopyLine";

export type EvidenceGap = {
	// The words for one record the pull request owes, such as "verify record".
	label: string;
	// The shell command that writes that record.
	fillCommand: string;
};

export type MissingListProps = {
	gaps: readonly EvidenceGap[];
	onCopy: (text: string) => void;
};

// One line per record the pull request owes. A line carries the command that
// writes the record, because the reader runs that command in a terminal, and
// a click puts the whole command on the clipboard.
export function MissingList({ gaps, onCopy }: MissingListProps) {
	return (
		<dl className="flex min-w-0 flex-col">
			{gaps.map((gap) => (
				<BlockRow key={gap.label} label={gap.label}>
					<span className="text-sm text-warning">missing</span>
					<CopyLine text={gap.fillCommand} tone="quiet" onCopy={onCopy} />
				</BlockRow>
			))}
		</dl>
	);
}
