import type { ActorRef } from "@trellis/api";
import { mentionedNames } from "../commentMentions/mentioned.ts";

export type Recipient = {
	id: string;
	personaName: string;
	kind: string;
	terminalId: string | null;
	sessionId: string | null;
};

export type Addressed = { run: Recipient; direct: boolean };

// The role words a mention can name instead of one agent: `@manager` reaches
// every live manager of the project, `@builders` every live builder.
const roleAliases: Record<string, string> = {
	manager: "manager",
	managers: "manager",
	builder: "builder",
	builders: "builder",
	reviewer: "reviewer",
	reviewers: "reviewer",
};

// Every live agent of the room's project receives a message, except its own
// author. When the body mentions one or more of those agents by run id, by
// persona name, or by role, only the mentioned agents receive it, and each
// of those deliveries is direct: it interrupts the agent's current turn. A
// mention of a name that is not a live agent of the project restricts
// nothing.
export const recipientsOf = (recipients: Recipient[], body: string, actor: ActorRef): Addressed[] => {
	const live = recipients.filter((run) => !(actor.kind === "agent" && actor.name === run.id));
	const everyone = live.map((run) => ({ run, direct: false }));
	if (!body.includes("@")) return everyone;
	const mentioned = mentionedNames(body, [
		...live.flatMap((run) => [run.id, run.personaName]),
		...Object.keys(roleAliases),
	]);
	const roles = new Set([...mentioned].map((name) => roleAliases[name]).filter((kind) => kind !== undefined));
	const named = live.filter(
		(run) => mentioned.has(run.id.toLowerCase()) || mentioned.has(run.personaName.toLowerCase()) || roles.has(run.kind),
	);
	return named.length === 0 ? everyone : named.map((run) => ({ run, direct: true }));
};
