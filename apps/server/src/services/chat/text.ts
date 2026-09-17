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
type LocalTimeOptions = { locale?: string; timeZone?: string };
const formatters = new Map<string, Intl.DateTimeFormat>();

const localDateTime = (iso: string, options: LocalTimeOptions = {}) => {
	const key = `${options.locale ?? ""}\0${options.timeZone ?? ""}`;
	let formatter = formatters.get(key);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat(options.locale, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZoneName: "short",
			...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
		});
		formatters.set(key, formatter);
	}
	return formatter.format(new Date(iso));
};

// `<Builder 01J...>` for an agent, `<dana>` for a person. The run id is in
// the label because a mention can name it.
export const chatSender = (line: Pick<PendingLine, "actorName" | "actorKind" | "actorDisplayName">) =>
	line.actorKind === "agent" && line.actorDisplayName !== null
		? `${line.actorDisplayName} ${line.actorName}`
		: line.actorName;

// One IRC style line per message, with the clock in the host time zone.
// A body with several lines keeps them.
export const chatLine = (line: ContextLine, options: LocalTimeOptions = {}) =>
	`#${line.channel} ${localDateTime(line.createdAt, options)} <${chatSender(line)}> ${line.body}`;

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
export const chatBatchText = (
	recipient: Recipient,
	lines: PendingLine[],
	context: ContextLine[] = [],
	options: LocalTimeOptions = {},
) => {
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
		...(context.length === 0 ? [] : ["Earlier, for context:", ...context.map((line) => chatLine(line, options))]),
		...(context.length === 0 ? [] : ["New:"]),
		...lines.map((line) => chatLine(line, options)),
		`Reply: trellis chat post ${project} <channel> --body "..." Read more: trellis chat read ${project} <channel>`,
	].join("\n");
};
