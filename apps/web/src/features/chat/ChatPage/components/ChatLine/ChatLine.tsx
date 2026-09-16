import type { ChatMessage } from "@trellis/api";
import { cx } from "@trellis/ui";

const nickTone = {
	agent: "text-accent",
	human: "text-fg",
	system: "text-fg-muted",
} as const;

// The nick a reader sees: the persona name of an agent, or the name of a
// person. The run id stays in the tooltip and in the mention the nick inserts.
export const chatNick = (message: ChatMessage) => message.actor.displayName ?? message.actor.name;

// What a click on the nick inserts into the input: the run id for an agent,
// because a mention by id reaches one agent even when two share a persona.
export const chatMention = (message: ChatMessage) => `@${message.actor.name} `;

const clock = (iso: string) => iso.slice(11, 19);

// A delivery that failed or has no receipt is the one fact a reader of the
// log needs about notifications. A pending or sent delivery is the normal case.
const troubled = (message: ChatMessage) =>
	(message.notifications ?? []).filter((notification) => ["failed", "unknown"].includes(notification.state));

// One IRC line in three columns: the UTC clock, the nick right-aligned in a
// fixed column so every body starts at the same x, and the body with its
// line breaks kept. The nick is a button that inserts a mention.
export function ChatLine({ message, onMention }: { message: ChatMessage; onMention: (text: string) => void }) {
	const trouble = troubled(message);
	const nick = chatNick(message);
	return (
		<li className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2 px-3 py-0.5 font-mono text-sm leading-5 hover:bg-elevated">
			<time dateTime={message.createdAt} title={message.createdAt} className="w-16 shrink-0 text-fg-faint tabular">
				{clock(message.createdAt)}
			</time>
			<button
				type="button"
				title={`${message.actor.kind}:${message.actor.name}. Click to mention.`}
				onClick={() => onMention(chatMention(message))}
				className={cx(
					"-my-1 w-40 shrink-0 truncate py-1 text-right hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 max-md:w-24",
					nickTone[message.actor.kind],
				)}
			>
				&lt;{nick}&gt;
			</button>
			<span className="min-w-0 break-words whitespace-pre-wrap text-fg">
				{message.body}
				{trouble.length > 0 && (
					<span
						className="ml-2 text-danger"
						title={trouble
							.map((notification) => `${notification.personaName}: ${notification.error ?? notification.state}`)
							.join("\n")}
					>
						[{trouble.length} undelivered]
					</span>
				)}
			</span>
		</li>
	);
}
