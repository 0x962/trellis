export type PendingLine = {
	messageId: string;
	// True when the message mentioned the receiving agent.
	direct: boolean;
	channel: string;
	body: string;
	actorName: string;
	actorKind: string;
	actorDisplayName: string | null;
	createdAt: string;
};

type Recipient = { runId: string; personaName: string; kind: string; projectPath: string };

// `<Builder 01J...>` for an agent, `<dana>` for a person. The run id is in
// the label because a mention can name it.
export const chatSender = (line: Pick<PendingLine, "actorName" | "actorKind" | "actorDisplayName">) =>
	line.actorKind === "agent" && line.actorDisplayName !== null
		? `${line.actorDisplayName} ${line.actorName}`
		: line.actorName;

// One IRC style line per message. A body with several lines keeps them.
export const chatLine = (line: PendingLine) =>
	`#${line.channel} ${line.createdAt.slice(11, 19)} <${chatSender(line)}> ${line.body}`;

// The text one agent receives for its pending lines. A manager reads data
// only, so it receives one JSON document. A worker receives the lines and
// the two commands it needs.
export const chatBatchText = (recipient: Recipient, lines: PendingLine[]) => {
	const mentioned = lines.some((line) => line.direct);
	if (recipient.kind === "manager")
		return JSON.stringify({
			type: "trellis.chat.messages",
			project: recipient.projectPath,
			mentioned,
			messages: lines.map((line) => ({
				id: line.messageId,
				channel: line.channel,
				body: line.body,
				createdAt: line.createdAt,
				mention: line.direct,
				actor: {
					kind: line.actorKind,
					name: line.actorName,
					...(line.actorDisplayName === null ? {} : { displayName: line.actorDisplayName }),
				},
			})),
			recipient: { runId: recipient.runId, personaName: recipient.personaName },
		});
	const project = recipient.projectPath;
	return [
		`trellis chat: ${lines.length} new message${lines.length === 1 ? "" : "s"} in the ${project} room.${mentioned ? " One mentions you. Answer it now." : ""}`,
		...lines.map(chatLine),
		`Reply: trellis chat post ${project} <channel> --body "..." Read more: trellis chat read ${project} <channel>`,
	].join("\n");
};
