import { GitCommit, Minus, Stack } from "@phosphor-icons/react";
import type { ReactionKeySchema, ReviewThread } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { type ReviewSuggestionState, ReviewThreadCard, type ThreadPlacement } from "@trellis/ui/review";
import type { ReactNode } from "react";
import type { z } from "zod";
import { useActor } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";
import { type ReviewApplyState, useReviewApply } from "../ReviewApply";
import { ReviewBody } from "../ReviewBody";

type SuggestionView = { state: ReviewSuggestionState; note?: ReactNode; actions?: ReactNode };

// What the suggestion widget of a thread shows, and whether it offers the
// apply controls. Every reason apply is off reads in the footer.
const suggestionView = (thread: ReviewThread, apply: ReviewApplyState | null): SuggestionView => {
	const suggestion = thread.suggestion ?? null;
	if (suggestion === null)
		return { state: "unknown", note: "The original lines are unknown, so this suggestion cannot be applied." };
	if (suggestion.state === "applied") {
		const sha = suggestion.appliedSha ?? "";
		return {
			state: "applied",
			note: (
				<>
					Applied in{" "}
					<a href={`${apply?.pr ?? ""}/commits/${sha}`} target="_blank" rel="noreferrer">
						{sha.slice(0, 7)}
					</a>
					.
				</>
			),
		};
	}
	if (suggestion.state === "outdated")
		return { state: "outdated", note: "The pull request head no longer holds these lines." };
	if (thread.status !== "open") return { state: "open", note: "The thread is resolved." };
	if (thread.side === "old") return { state: "open", note: "Suggestions on deleted lines cannot be applied." };
	if (apply === null) return { state: "open" };
	if (!apply.prOpen) return { state: "open", note: "Suggestions apply to an open pull request only." };
	if (thread.revisionId !== apply.revisionId)
		return { state: "open", note: "This suggestion sits on another revision." };
	const inBatch = apply.batch.has(thread.id);
	return {
		state: "open",
		note: inBatch ? "In the batch." : undefined,
		actions: (
			<>
				<Tooltip content={inBatch ? "Remove from batch" : "Add suggestion to batch"}>
					<IconButton
						size="xs"
						label={inBatch ? "Remove from batch" : "Add suggestion to batch"}
						icon={inBatch ? <Minus /> : <Stack />}
						onClick={() => apply.toggleBatch(thread.id)}
					/>
				</Tooltip>
				<Tooltip content="Commit suggestion">
					<IconButton
						size="xs"
						label="Commit suggestion"
						icon={<GitCommit />}
						onClick={() => apply.apply([thread.id])}
					/>
				</Tooltip>
			</>
		),
	};
};

// `place` says where the diff drew this thread. A thread the diff calls
// outdated folds to one line, with the code it was written against above
// it. The Findings section passes no place, because it draws no diff.
export function ReviewComment({ thread, place }: { thread: ReviewThread; place?: ThreadPlacement }) {
	const { client, orpc, queryClient } = useApp();
	const actor = useActor();
	const apply = useReviewApply();
	const invalid = () => queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
	const view = suggestionView(thread, apply);
	return (
		<ReviewThreadCard
			thread={thread}
			actor={actor?.name}
			anchor={`${thread.path}:${thread.line}`}
			outdated={place?.kind === "outdated" ? { lines: thread.anchorLines ?? [] } : undefined}
			renderBody={(body, message) =>
				message.root ? (
					<ReviewBody
						body={body}
						original={thread.suggestion?.original ?? null}
						state={view.state}
						note={view.note}
						actions={view.actions}
					/>
				) : (
					<ReviewBody
						body={body}
						original={null}
						state="unknown"
						note="A suggestion applies from the first message of a thread."
					/>
				)
			}
			onReply={async (body) => {
				await client.reviews.reply({ id: thread.id, body });
				await invalid();
			}}
			onResolve={async () => {
				await client.reviews.resolve({ id: thread.id, resolved: thread.status !== "resolved" });
				await invalid();
			}}
			onEdit={async (id, body, expectedVersion) => {
				await client.reviews.edit({ id, body, expectedVersion });
				await invalid();
			}}
			onReaction={async (id, reaction, remove) => {
				await client.reviews.reaction({ id, reaction: reaction as z.infer<typeof ReactionKeySchema>, remove });
				await invalid();
			}}
		/>
	);
}
