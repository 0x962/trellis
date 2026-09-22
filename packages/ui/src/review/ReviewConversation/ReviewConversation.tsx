import type { ReactNode } from "react";

type Author = { login: string };
type ConversationAuthor = { login: string; avatarUrl: string | null };
export type GitHubConversationItem = {
	id: string;
	kind: "comment" | "review" | "line";
	author: ConversationAuthor | null;
	body: string;
	state: string | null;
	path: string | null;
	line: number | null;
	side: "old" | "new" | null;
	url: string | null;
	isBot: boolean;
	createdAt: string;
	updatedAt: string | null;
};
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

const conversationOf = (meta: ConversationMeta | undefined, items: GitHubConversationItem[] | undefined) => {
	const source = items ?? [
		...(meta?.comments ?? []).map(
			(comment): GitHubConversationItem => ({
				id: comment.id,
				kind: "comment",
				author: comment.author ? { login: comment.author.login, avatarUrl: null } : null,
				body: comment.body,
				state: null,
				path: null,
				line: null,
				side: null,
				url: null,
				isBot: false,
				createdAt: comment.createdAt,
				updatedAt: null,
			}),
		),
		...(meta?.reviews ?? []).map(
			(review): GitHubConversationItem => ({
				id: review.id,
				kind: "review",
				author: review.author ? { login: review.author.login, avatarUrl: null } : null,
				body: review.body,
				state: review.state,
				path: null,
				line: null,
				side: null,
				url: null,
				isBot: false,
				createdAt: review.submittedAt,
				updatedAt: null,
			}),
		),
	];
	return [...source].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

const timeLabel = (value: string) => new Date(value).toLocaleString();

export function ReviewConversation({
	meta,
	items,
	renderBody,
	onLineComment,
}: {
	meta: ConversationMeta | undefined;
	items?: GitHubConversationItem[];
	renderBody: (body: string) => ReactNode;
	onLineComment?: (item: GitHubConversationItem) => void;
}) {
	const conversation = conversationOf(meta, items);
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
				<article
					className="review-thread"
					key={message.id}
					aria-label={`GitHub comment by ${message.author?.login ?? "unknown"}`}
				>
					<div className="review-message">
						<header>
							{message.author?.avatarUrl && (
								<img className="review-conversation-avatar" src={message.author.avatarUrl} alt="" />
							)}
							<strong>{message.author?.login ?? "unknown"}</strong>
							{message.state && <span className="review-meta">{states[message.state] ?? message.state}</span>}
							{message.path && message.line && (
								<button type="button" className="review-conversation-location" onClick={() => onLineComment?.(message)}>
									{message.path}:{message.line}
								</button>
							)}
							<time className="review-conversation-time" dateTime={message.createdAt}>
								{timeLabel(message.createdAt)}
							</time>
						</header>
						{message.body &&
							(message.isBot ? (
								<details className="review-conversation-bot">
									<summary>Show bot comment</summary>
									{renderBody(message.body)}
								</details>
							) : (
								renderBody(message.body)
							))}
					</div>
				</article>
			))}
		</section>
	);
}
