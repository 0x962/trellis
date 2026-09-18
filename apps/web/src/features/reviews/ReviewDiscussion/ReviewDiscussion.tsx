import { ArrowDown, ArrowUp, Copy } from "@phosphor-icons/react";
import type { ReviewRevision, ReviewThread } from "@trellis/api";
import { EmptyState, IconButton, Input, Select, Tooltip } from "@trellis/ui";
import { type ConversationMeta, ReviewConversation } from "@trellis/ui/review";
import { type ReactNode, useEffect, useState } from "react";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";

type Props = {
	threads: ReviewThread[];
	activeThread: string | null;
	revision: ReviewRevision | null;
	renderThread: (id: string) => ReactNode;
	onJump: (thread: ReviewThread) => void;
};

export function ReviewDiscussion({ threads, activeThread, revision, renderThread, onJump }: Props) {
	const [filter, setFilter] = useState("all");
	const [search, setSearch] = useState("");
	const [position, setPosition] = useState(-1);
	const visible = threads.filter(
		(thread) =>
			(filter === "all" || filter === thread.status) &&
			`${thread.path} ${thread.author} ${thread.body}`.toLowerCase().includes(search.toLowerCase()),
	);
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
	return (
		<div className="review-scroll">
			<div className="review-list">
				<ReviewConversation
					meta={revision?.meta as ConversationMeta | undefined}
					renderBody={(body) => <ReviewMarkdown body={body} />}
				/>
				{threads.length > 0 && (
					<>
						<h2 className="review-local-heading">Review comments</h2>
						<div className="review-discussion-toolbar">
							<Input
								hideLabel
								placeholder="Find a thread…"
								label="Find a thread"
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
							<Tooltip content="Previous thread">
								<IconButton
									label="Previous thread"
									icon={<ArrowUp />}
									disabled={!visible.length}
									onClick={() => next(-1)}
								/>
							</Tooltip>
							<Tooltip content="Next thread">
								<IconButton
									label="Next thread"
									icon={<ArrowDown />}
									disabled={!visible.length}
									onClick={() => next(1)}
								/>
							</Tooltip>
						</div>
						{visible.length === 0 && <EmptyState description="No threads match." />}
						{visible.map((thread) => (
							<section key={thread.id}>
								<div className="review-thread-location">
									<button type="button" className="review-meta" onClick={() => onJump(thread)}>
										{thread.path}:{thread.startLine}–{thread.line} · {thread.side}
										{thread.revisionId !== revision?.id ? " · Older or unknown revision" : ""}
									</button>
									<Tooltip content="Copy thread link">
										<IconButton
											label="Copy thread link"
											icon={<Copy />}
											onClick={() =>
												void navigator.clipboard.writeText(
													`${location.origin}${location.pathname}#discussion?thread=${thread.id}`,
												)
											}
										/>
									</Tooltip>
								</div>
								{renderThread(thread.id)}
							</section>
						))}
					</>
				)}
			</div>
		</div>
	);
}
