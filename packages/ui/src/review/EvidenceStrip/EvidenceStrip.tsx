import type { ReactNode } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Skeleton } from "../../primitives/Skeleton";
import { type EvidenceGap, MissingList } from "./components/MissingList";

export type { EvidenceGap };

export type EvidenceStripProps = {
	// The proof state in words, such as "needs the after image and the console
	// list" or "proof complete".
	status: string;
	missing: readonly EvidenceGap[];
	// True when the pull request carries at least one record. `children` cannot
	// answer this, because a caller passes the same element whether or not it
	// found a record to draw in it.
	hasRecords: boolean;
	// Words that print after the count, such as "captured on 8b21f0c".
	note?: string;
	// True while the request for the records is not complete.
	loading?: boolean;
	// The records themselves. A frontend pull request passes
	// FrontendEvidence, a backend pull request passes BackendEvidence, and a
	// pull request of both kinds passes both.
	children?: ReactNode;
	onCopy: (text: string) => void;
};

export function EvidenceStrip({
	status,
	missing,
	hasRecords,
	note,
	loading = false,
	children,
	onCopy,
}: EvidenceStripProps) {
	const line = `${status}${note === undefined ? "" : ` · ${note}`}`;
	return (
		<section aria-busy={loading} aria-label="Evidence" className="flex min-w-0 flex-col gap-3">
			<SectionHeader
				title="EVIDENCE"
				actions={
					<span className="tabular" role="status" aria-live="polite">
						{loading ? "reading" : line}
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
					{missing.length > 0 && <MissingList gaps={missing} onCopy={onCopy} />}
				</>
			)}
		</section>
	);
}
