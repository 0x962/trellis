import type { ActorRef } from "@trellis/api";
import { mentionedNames } from "../commentMentions/mentioned.ts";

export type Recipient = { id: string; personaName: string; terminalId: string | null; sessionId: string | null };

// Every live agent of the tree receives a message, except its own author.
// When the body mentions one or more of those agents by run id or by
// persona name, only the mentioned agents receive it. A mention of a name
// that is not a live agent of the tree restricts nothing.
export const recipientsOf = (recipients: Recipient[], body: string, actor: ActorRef) => {
	const live = recipients.filter((run) => !(actor.kind === "agent" && actor.name === run.id));
	if (!body.includes("@")) return live;
	const mentioned = mentionedNames(
		body,
		live.flatMap((run) => [run.id, run.personaName]),
	);
	const named = live.filter(
		(run) => mentioned.has(run.id.toLowerCase()) || mentioned.has(run.personaName.toLowerCase()),
	);
	return named.length === 0 ? live : named;
};
