import type { ReactNode } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Skeleton } from "../../primitives/Skeleton";
import { BlockRow } from "../BlockRow";

export type EvidenceGap = {
	// The words for one record the pull request owes, such as "verify record".
	label: string;
	// The shell command that writes that record.
	fillCommand: string;
};

export type EvidenceStripProps = {
	// How many of the owed records the pull request carries.
	present: number;
	// How many records the pull request owes in total.
	required: number;
	missing: readonly EvidenceGap[];
	// True when the pull request carries at least one record. `children` cannot
	// answer this, because a caller passes the same element whether or not it
	// found a record to draw in it.
	hasRecords: boolean;
	// Words that print after the count, such as "captured on 8b21f0c".
	note?: string;
	// True while the request for the records is not complete.
	loading?: boolean;
	// The records themselves. A frontend pull request passes FrontendEvidence.
	children?: ReactNode;
	onCopy: (text: string) => void;
};

// A missing line carries the command that writes the record, because the
// reader runs that command in a terminal.
export function EvidenceStrip({
	present,
	required,
	missing,
	hasRecords,
	note,
	loading = false,
	children,
	onCopy,
}: EvidenceStripProps) {
	const count = `${present} of ${required}${note === undefined ? "" : ` · ${note}`}`;
	return (
		<section aria-busy={loading} aria-label="Evidence" className="flex min-w-0 flex-col gap-3">
			<SectionHeader
				title="EVIDENCE"
				actions={
					<span className="tabular" role="status" aria-live="polite">
						{loading ? "reading" : count}
					</span>
				}
			/>
			{loading ? (
				<Skeleton height="h-4" lines={3} />
			) : missing.length === 0 && !hasRecords ? (
				<EmptyState description="This pull request owes no evidence." />
			) : (
				<>
					{hasRecords && children}
					{missing.length > 0 && (
						<dl className="flex min-w-0 flex-col">
							{missing.map((gap) => (
								<BlockRow key={gap.label} label={gap.label}>
									<span className="text-sm text-warning">missing</span>
									<button
										type="button"
										aria-label={`Copy ${gap.fillCommand}`}
										onClick={() => onCopy(gap.fillCommand)}
										className="-mx-1 max-w-full cursor-pointer self-start rounded-sm px-1 py-0.5 text-left font-mono text-xs break-words text-fg-muted transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:py-2"
									>
										{gap.fillCommand}
									</button>
								</BlockRow>
							))}
						</dl>
					)}
				</>
			)}
		</section>
	);
}
