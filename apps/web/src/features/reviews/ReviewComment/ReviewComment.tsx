import type { ReactionKeySchema, ReviewThread } from "@trellis/api";
import { ReviewThreadCard } from "@trellis/ui/review";
import type { z } from "zod";
import { useActor } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";
export function ReviewComment({ thread }: { thread: ReviewThread }) {
	const { client, orpc, queryClient } = useApp();
	const actor = useActor();
	const invalid = () => queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
	return (
		<ReviewThreadCard
			thread={thread}
			actor={actor?.name}
			renderBody={(body) => <ReviewMarkdown body={body} />}
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
