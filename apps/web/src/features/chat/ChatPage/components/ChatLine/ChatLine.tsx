import type { ChatMessage } from "@trellis/api";
import { cx } from "@trellis/ui";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";

const nickTone = {
	agent: "text-accent",
	human: "text-fg",
	system: "text-fg-muted",
} as const;

// The name a reader sees: the persona name of an agent, or the name of a
// person. The run id stays in the tooltip and in the mention the name inserts.
export const chatNick = (message: ChatMessage) => message.actor.displayName ?? message.actor.name;

// What a click on the name inserts into the input: the run id for an agent,
// because a mention by id reaches one agent even when two share a persona.
export const chatMention = (message: ChatMessage) => `@${message.actor.name} `;

const clock = (iso: string) => iso.slice(11, 19);

// A delivery that failed or has no receipt is the one fact a reader of the
// log needs about notifications. A pending or sent delivery is the normal case.
const troubled = (message: ChatMessage) =>
	(message.notifications ?? []).filter((notification) => ["failed", "unknown"].includes(notification.state));

export type ChatLineProps = {
	message: ChatMessage;
	render: (markdown: string) => string;
	onMention: (text: string) => void;
};

// One message: a header line with the UTC clock and the full name, then the
// body as markdown under it, indented to the name column. The name is a
// button that inserts a mention.
export function ChatLine({ message, render, onMention }: ChatLineProps) {
	const trouble = troubled(message);
	return (
		<li className="px-3 py-1 hover:bg-elevated">
			<div className="flex items-baseline gap-2 font-mono text-sm leading-5">
				<time dateTime={message.createdAt} title={message.createdAt} className="w-16 shrink-0 text-fg-faint tabular">
					{clock(message.createdAt)}
				</time>
				<button
					type="button"
					title={`${message.actor.kind}:${message.actor.name}. Click to mention.`}
					onClick={() => onMention(chatMention(message))}
					className={cx(
						"-my-1 min-w-0 truncate py-1 font-medium hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
						nickTone[message.actor.kind],
					)}
				>
					{chatNick(message)}
				</button>
				{message.actor.kind === "agent" && <span className="text-xs text-fg-faint">agent</span>}
				{trouble.length > 0 && (
					<span
						className="text-xs text-danger"
						title={trouble
							.map((notification) => `${notification.personaName}: ${notification.error ?? notification.state}`)
							.join("\n")}
					>
						{trouble.length} undelivered
					</span>
				)}
			</div>
			<ReadOnlyMarkdown
				markdown={message.body}
				render={render}
				formatClassName="chat-markdown"
				className="pl-18 text-sm"
			/>
		</li>
	);
}
