import type { ChatMessage } from "@trellis/api";
import { cx } from "@trellis/ui";

const nickTone = {
	agent: "text-accent",
	human: "text-fg",
	system: "text-fg-muted",
} as const;

// `<Builder 01J...>` for an agent, `<dana>` for a person. The run id is in
// the nick because a mention can name it, and a reader copies it from here.
export const chatNick = (message: ChatMessage) =>
	message.actor.kind === "agent" && message.actor.displayName !== undefined
		? `${message.actor.displayName} ${message.actor.name}`
		: message.actor.name;

const clock = (iso: string) => iso.slice(11, 19);

// A delivery that failed or has no receipt is the one fact a reader of the
// log needs about notifications. A pending or sent delivery is the normal case.
const troubled = (message: ChatMessage) =>
	(message.notifications ?? []).filter((notification) => ["failed", "unknown"].includes(notification.state));

// One IRC line: the UTC clock, the nick in angle brackets, the body with
// its line breaks kept.
export function ChatLine({ message }: { message: ChatMessage }) {
	const trouble = troubled(message);
	return (
		<li className="flex gap-2 px-3 py-0.5 font-mono text-sm leading-5 hover:bg-elevated">
			<time dateTime={message.createdAt} title={message.createdAt} className="shrink-0 text-fg-faint tabular">
				{clock(message.createdAt)}
			</time>
			<span className={cx("shrink-0", nickTone[message.actor.kind])}>&lt;{chatNick(message)}&gt;</span>
			<span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-fg">{message.body}</span>
			{trouble.length > 0 && (
				<span
					className="shrink-0 text-danger"
					title={trouble
						.map((notification) => `${notification.personaName}: ${notification.error ?? notification.state}`)
						.join("\n")}
				>
					{trouble.length} undelivered
				</span>
			)}
		</li>
	);
}
