import { ArrowClockwise, ArrowDown, ArrowUp, Copy } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision, ReviewSubmission, ReviewThread } from "@trellis/api";
import { IconButton, Input, Select, Tooltip } from "@trellis/ui";
import { type ConversationMeta, ReviewConversation } from "@trellis/ui/review";
import { type ReactNode, useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import type { DraftFinding } from "../ReviewComposer/ReviewComposer";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";

type Props = {
	drafts: DraftFinding[];
	threads: ReviewThread[];
	revision: ReviewRevision | null;
	submissions: ReviewSubmission[];
	renderThread: (id: string) => ReactNode;
	onJump: (thread: ReviewThread) => void;
};
export function ReviewDiscussion({ drafts, threads, revision, submissions, renderThread, onJump }: Props) {
	const { client, orpc, queryClient } = useApp();
	const [filter, setFilter] = useState("all");
	const [search, setSearch] = useState("");
	const [position, setPosition] = useState(-1);
	const resend = useMutation({
		mutationFn: (id: string) => client.reviews.resend({ id }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
		},
	});
	const visible = threads.filter(
		(t) =>
			(filter === "all" || filter === t.status) &&
			`${t.path} ${t.author} ${t.body}`.toLowerCase().includes(search.toLowerCase()),
	);
	const visibleDrafts = drafts.filter(
		(d) => filter !== "resolved" && `${d.path} ${d.body}`.toLowerCase().includes(search.toLowerCase()),
	);
	const next = (delta: number) => {
		const index = (position + delta + visible.length) % visible.length;
		setPosition(index);
		document.getElementById(`thread-${visible[index]!.id}`)?.scrollIntoView({ block: "center" });
	};
	useEffect(() => {
		const id = new URLSearchParams(location.hash.split("?")[1]).get("thread");
		if (id) document.getElementById(`thread-${id}`)?.scrollIntoView({ block: "center" });
	}, []);
	return (
		<div className="review-scroll">
			<div className="review-list">
				<ReviewConversation
					meta={revision?.meta as ConversationMeta | undefined}
					renderBody={(body) => <ReviewMarkdown body={body} />}
				/>
				{(threads.length > 0 || drafts.length > 0) && (
					<>
						<h2 className="review-local-heading">Local review</h2>
						<div className="review-discussion-toolbar">
							<Input
								hideLabel
								placeholder="Find a thread…"
								label="Find a thread"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
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
						{visibleDrafts.map((draft) => (
							<section key={draft.id}>
								<div className="review-thread-location">
									{draft.path}:{draft.startLine}–{draft.line}
								</div>
								{renderThread(draft.id)}
							</section>
						))}
						{visible.length === 0 && visibleDrafts.length === 0 && <p>No threads match.</p>}
						{visible.map((t) => (
							<section key={t.id}>
								<div className="review-thread-location">
									<button type="button" className="review-meta" onClick={() => onJump(t)}>
										{t.path}:{t.startLine}–{t.line} · {t.side}
										{t.revisionId !== revision?.id ? " · Older or unknown revision" : ""}
									</button>
									<Tooltip content="Copy thread link">
										<IconButton
											label="Copy thread link"
											icon={<Copy />}
											onClick={() =>
												void navigator.clipboard.writeText(
													`${location.origin}${location.pathname}#discussion?thread=${t.id}`,
												)
											}
										/>
									</Tooltip>
								</div>
								{renderThread(t.id)}
							</section>
						))}
					</>
				)}
				{submissions.length > 0 && (
					<details className="review-disclosure">
						<summary>Submitted reviews ({submissions.length})</summary>
						{submissions.map((s) => (
							<section className="review-thread" key={s.id}>
								<div className="review-message">
									<strong>
										{s.author} · {s.verdict}
									</strong>
									<ReviewMarkdown body={s.body} />
									<details className="review-disclosure">
										<summary>Submitted findings ({s.threads.length})</summary>
										{s.threads.map((t) => (
											<div key={t.id}>
												<p>
													{t.path}:{t.startLine}–{t.line} · {t.author}
												</p>
												<ReviewMarkdown body={t.body} />
											</div>
										))}
									</details>
									{s.deliveries.map((d) => (
										<div key={d.id} className="review-header">
											<p className="review-meta">
												Agent {d.runId} · {d.state} · {d.readAt ? "Read" : "Unread"}
												{d.error ? `: ${d.error}` : ""}
											</p>
											{["failed", "unknown"].includes(d.state) && (
												<Tooltip content="Resend notification">
													<IconButton
														label="Resend notification"
														icon={<ArrowClockwise />}
														disabled={resend.isPending}
														onClick={() => resend.mutate(d.id)}
													/>
												</Tooltip>
											)}
										</div>
									))}
								</div>
							</section>
						))}
					</details>
				)}
				{resend.isError && (
					<p role="alert" className="review-error">
						{resend.error.message}
					</p>
				)}
			</div>
		</div>
	);
}
