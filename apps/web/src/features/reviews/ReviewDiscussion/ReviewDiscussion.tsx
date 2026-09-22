import { ArrowDown, ArrowUp, Copy } from "@phosphor-icons/react";
import type { GitHubConversationItem, ReviewRevision, ReviewThread } from "@trellis/api";
import { EmptyState, IconButton, Input, SectionHeader, Select, Tooltip } from "@trellis/ui";
import { type ConversationMeta, ReviewConversation } from "@trellis/ui/review";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";
import { threadGroups } from "./threadGroups";

type Props = {
	threads: ReviewThread[];
	activeThread: string | null;
	revision: ReviewRevision | null;
	renderThread: (id: string) => ReactNode;
	onJump: (thread: ReviewThread) => void;
	onGitHubLine: (item: GitHubConversationItem) => void;
};

export function ReviewDiscussion({ threads, activeThread, revision, renderThread, onJump, onGitHubLine }: Props) {
	const [filter, setFilter] = useState("all");
	const [search, setSearch] = useState("");
	const [position, setPosition] = useState(-1);
	// The open comments come first: they are the work. A resolved comment draws
	// as one line that opens on a click, so the page builds no message body
	// for it until the reader asks.
	//
	// The split runs once per change of the threads, the status choice or the
	// text, never once per render of the page around it.
	const { open, resolved } = useMemo(
		() => threadGroups(threads, { status: filter, search }),
		[threads, filter, search],
	);
	const visible = useMemo(() => [...open, ...resolved], [open, resolved]);
	const next = (delta: number) => {
		const index = (position + delta + visible.length) % visible.length;
		setPosition(index);
		document.getElementById(`thread-${visible[index]!.id}`)?.scrollIntoView({ block: "center" });
	};
	const activeThreadVisible = visible.some((thread) => thread.id === activeThread);
	useEffect(() => {
		if (activeThreadVisible) {
			document.getElementById(`thread-${activeThread}`)?.scrollIntoView({ block: "center" });
		}
	}, [activeThread, activeThreadVisible]);
	const threadEntry = (thread: ReviewThread) => (
		<section key={thread.id}>
			<div className="review-thread-location">
				<button type="button" className="review-meta" onClick={() => onJump(thread)}>
					{thread.path}:{thread.startLine}–{thread.line} · {thread.side}
					{thread.revisionId !== revision?.id ? " · Older or unknown revision" : ""}
				</button>
				<Tooltip content="Copy comment link">
					<IconButton
						label="Copy comment link"
						icon={<Copy />}
						onClick={() =>
							void navigator.clipboard.writeText(`${location.origin}${location.pathname}#?thread=${thread.id}`)
						}
					/>
				</Tooltip>
			</div>
			{renderThread(thread.id)}
		</section>
	);
	return (
		<div className="review-scroll">
			<div className="review-list">
				<ReviewConversation
					meta={revision?.meta as ConversationMeta | undefined}
					items={revision?.githubConversation}
					renderBody={(body) => <ReviewMarkdown body={body} />}
					onLineComment={onGitHubLine}
				/>
				{threads.length > 0 && (
					<>
						<SectionHeader title="Local review comments" className="mt-6" />
						<div className="review-discussion-toolbar">
							<Input
								hideLabel
								placeholder="Find a comment…"
								label="Find a comment"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
							/>
							<Select
								label="Thread status"
								value={filter}
								onValueChange={setFilter}
								items={[
									{ value: "all", label: "All" },
									{ value: "open", label: "Open" },
									{ value: "resolved", label: "Resolved" },
								]}
							/>
							<Tooltip content="Previous comment">
								<IconButton
									label="Previous comment"
									icon={<ArrowUp />}
									disabled={!visible.length}
									onClick={() => next(-1)}
								/>
							</Tooltip>
							<Tooltip content="Next comment">
								<IconButton
									label="Next comment"
									icon={<ArrowDown />}
									disabled={!visible.length}
									onClick={() => next(1)}
								/>
							</Tooltip>
						</div>
						{visible.length === 0 && <EmptyState description="No comments match." />}
						{open.length > 0 && <SectionHeader title="Open" count={open.length} level={3} />}
						{open.map(threadEntry)}
						{resolved.length > 0 && <SectionHeader title="Resolved" count={resolved.length} level={3} />}
						{resolved.map(threadEntry)}
					</>
				)}
			</div>
		</div>
	);
}
