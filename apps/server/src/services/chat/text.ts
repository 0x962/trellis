export type ContextLine = {
	messageId: string;
	channel: string;
	body: string;
	actorName: string;
	actorKind: string;
	actorDisplayName: string | null;
	createdAt: string;
};

export type PendingLine = ContextLine & {
	// True when the message mentioned the receiving agent.
	direct: boolean;
};

type Recipient = { runId: string; personaName: string; kind: string; projectPath: string };

// `<Builder 01J...>` for an agent, `<dana>` for a person. The run id is in
// the label because a mention can name it.
export const chatSender = (line: Pick<PendingLine, "actorName" | "actorKind" | "actorDisplayName">) =>
	line.actorKind === "agent" && line.actorDisplayName !== null
		? `${line.actorDisplayName} ${line.actorName}`
		: line.actorName;

// One IRC style line per message. A body with several lines keeps them.
export const chatLine = (line: ContextLine) =>
	`#${line.channel} ${line.createdAt.slice(11, 19)} <${chatSender(line)}> ${line.body}`;

const asData = (line: ContextLine) => ({
	id: line.messageId,
	channel: line.channel,
	body: line.body,
	createdAt: line.createdAt,
	actor: {
		kind: line.actorKind,
		name: line.actorName,
		...(line.actorDisplayName === null ? {} : { displayName: line.actorDisplayName }),
	},
});

// The text one agent receives for its pending lines, with the recent lines
// of the same channels before them as context. A manager reads data only,
// so it receives one JSON document. A worker receives the lines and the
// two commands it needs.
export const chatBatchText = (recipient: Recipient, lines: PendingLine[], context: ContextLine[] = []) => {
	const mentioned = lines.some((line) => line.direct);
	if (recipient.kind === "manager")
		return JSON.stringify({
			type: "trellis.chat.messages",
			project: recipient.projectPath,
			mentioned,
			context: context.map(asData),
			messages: lines.map((line) => ({ ...asData(line), mention: line.direct })),
			recipient: { runId: recipient.runId, personaName: recipient.personaName },
		});
	const project = recipient.projectPath;
	return [
		`trellis chat: ${lines.length} new message${lines.length === 1 ? "" : "s"} in the ${project} room.${mentioned ? " One mentions you. Answer it now." : ""}`,
		...(context.length === 0 ? [] : ["Earlier, for context:", ...context.map(chatLine)]),
		...(context.length === 0 ? [] : ["New:"]),
		...lines.map(chatLine),
		`Reply: trellis chat post ${project} <channel> --body "..." Read more: trellis chat read ${project} <channel>`,
	].join("\n");
};
