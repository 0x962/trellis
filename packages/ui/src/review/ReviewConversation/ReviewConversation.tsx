import type { ReactNode } from "react";

type Author = { login: string };
export type ConversationMeta = {
	body?: string;
	author?: Author;
	comments?: { id: string; body: string; createdAt: string; author?: Author }[];
	reviews?: { id: string; body: string; state: string; submittedAt: string; author?: Author }[];
};
const states: Record<string, string> = {
	APPROVED: "Approved",
	CHANGES_REQUESTED: "Changes requested",
	COMMENTED: "Reviewed",
	DISMISSED: "Dismissed",
};
export function ReviewConversation({
	meta,
	renderBody,
}: {
	meta: ConversationMeta | undefined;
	renderBody: (body: string) => ReactNode;
}) {
	const conversation = [
		...(meta?.comments ?? []).map((comment) => ({ ...comment, state: "", at: comment.createdAt })),
		...(meta?.reviews ?? []).map((review) => ({ ...review, at: review.submittedAt })),
	].sort((a, b) => a.at.localeCompare(b.at));
	return (
		<section className="review-conversation" aria-label="GitHub conversation">
			<article className="review-thread" aria-label="PR description">
				<div className="review-message">
					<header>
						<strong>{meta?.author?.login}</strong>
					</header>
					{renderBody(meta?.body || "No description provided.")}
				</div>
			</article>
			{conversation.map((message) => (
				<article className="review-thread" key={message.id} aria-label={`GitHub comment by ${message.author?.login}`}>
					<div className="review-message">
						<header>
							<strong>{message.author?.login}</strong>
							{message.state && <span className="review-meta">{states[message.state] ?? message.state}</span>}
							<time className="review-conversation-time" dateTime={message.at}>
								{new Date(message.at).toLocaleDateString()}
							</time>
						</header>
						{message.body && renderBody(message.body)}
					</div>
				</article>
			))}
		</section>
	);
}
