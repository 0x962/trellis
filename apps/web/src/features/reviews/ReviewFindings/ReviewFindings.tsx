import type { ReviewThread } from "@trellis/api";
import { EmptyState, SectionHeader } from "@trellis/ui";
import { useState } from "react";
import { type FindingGroup, findingGroups, findingSummary } from "./findingGroups";

export type ReviewFindingsProps = {
	// Every comment thread of the pull request, across every revision.
	threads: ReviewThread[];
	// The revision the Diff tab draws, or null while it loads.
	revisionId: string | null;
	// Opens one thread on the Diff tab.
	onOpen: (thread: ReviewThread) => void;
};

const groupLabel = (group: FindingGroup) => {
	if (group.current) return "This revision";
	if (group.revisionId === "") return "Written before the first revision";
	return `An earlier revision · ${new Date(group.writtenAt).toLocaleDateString()}`;
};

const stateWords = (thread: ReviewThread) =>
	thread.status === "resolved" ? `Resolved by ${thread.resolvedBy}` : "Open";

function FindingRow({ thread, onOpen }: { thread: ReviewThread; onOpen: (thread: ReviewThread) => void }) {
	return (
		<li>
			<button
				type="button"
				onClick={() => onOpen(thread)}
				className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-start hover:bg-surface"
			>
				<span className="flex min-w-0 max-w-full items-baseline gap-2 text-xs text-fg-faint">
					<span className="font-medium text-fg-muted">{thread.author}</span>
					<span className="truncate font-mono">
						{thread.path}:{thread.line}
					</span>
					<span className="shrink-0">{stateWords(thread)}</span>
				</span>
				<span className="line-clamp-2 text-sm text-fg">{findingSummary(thread.body)}</span>
			</button>
		</li>
	);
}

function FindingGroupBlock({ group, onOpen }: { group: FindingGroup; onOpen: (thread: ReviewThread) => void }) {
	const [showResolved, setShowResolved] = useState(false);
	return (
		<section aria-label={groupLabel(group)} className="flex min-w-0 flex-col gap-1">
			<SectionHeader title={groupLabel(group)} count={group.open.length + group.resolved.length} level={3} />
			<ul className="flex min-w-0 flex-col">
				{group.open.map((thread) => (
					<FindingRow key={thread.id} thread={thread} onOpen={onOpen} />
				))}
			</ul>
			{group.resolved.length > 0 && (
				<>
					<button
						type="button"
						aria-expanded={showResolved}
						onClick={() => setShowResolved(!showResolved)}
						className="self-start px-2 py-1 text-xs text-fg-faint hover:text-fg"
					>
						{showResolved ? "Hide" : "Show"} {group.resolved.length} resolved
					</button>
					{showResolved && (
						<ul className="flex min-w-0 flex-col">
							{group.resolved.map((thread) => (
								<FindingRow key={thread.id} thread={thread} onOpen={onOpen} />
							))}
						</ul>
					)}
				</>
			)}
		</section>
	);
}

// What the reviewers wrote on this pull request: every comment thread of
// every revision, open and resolved. A thread of an earlier revision has
// nowhere else to show once the head moves, and a resolved thread folds
// away on the Diff tab, so this section is the one place that holds all of
// them. The rows are Trellis comments, never GitHub ones.
export function ReviewFindings({ threads, revisionId, onOpen }: ReviewFindingsProps) {
	const groups = findingGroups(threads, revisionId);
	return (
		<section aria-label="Findings" className="flex min-w-0 flex-col gap-2">
			<SectionHeader title="Findings" count={threads.length} />
			{groups.length === 0 ? (
				<EmptyState title="No findings" description="No review comment names this pull request." />
			) : (
				<div className="flex min-w-0 flex-col gap-3">
					{groups.map((group) => (
						<FindingGroupBlock key={group.revisionId} group={group} onOpen={onOpen} />
					))}
				</div>
			)}
		</section>
	);
}
