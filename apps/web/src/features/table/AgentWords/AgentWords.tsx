import { AttentionDot, CodeText, cx, WorkingAgentText } from "@trellis/ui";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";
import type { TicketAgentLine } from "../utils/agentLines";

type WorkingTicketAgentLine = Extract<TicketAgentLine, { working: true }>;

type AgentWordsProps = {
	line: TicketAgentLine;
	// The markdown renderer of the message. It defaults to the renderer of
	// the app, which reads the browser DOM to strip whatever runs. A test
	// runs without that DOM and passes the parser alone.
	render?: (markdown: string) => string;
	// True on the agent line of the epic table: the message renders as
	// markdown, it wraps onto as many lines as it needs, and the dot gets a
	// 16 px slot of its own, so the text starts where the number of a pull
	// request row starts. False on the phone row, where the words stay on one
	// line as plain text and truncate.
	wrap?: boolean;
};

const lineContent = (line: WorkingTicketAgentLine) =>
	line.spans.map((span) =>
		span.kind === "code" ? <CodeText key={span.key}>{span.text}</CodeText> : <span key={span.key}>{span.text}</span>,
	);

// The dot and the words of one agent line. The epic table draws them on the
// line under a ticket row or under a pull request line, and a phone row
// draws them on its second line.
//
// An agent writes its message in markdown, so the epic table renders it with
// `ReadOnlyMarkdown`, the component the ticket description uses. The
// `agent-markdown` rules of `app.css` keep the blocks tight and hold every
// heading at the size of the line text, so one message cannot shout over the
// table. Those rules take the text color from the element above, which is
// why the color of the line sits on the span and not on the markdown. The
// phone row has one line of room, so it prints the raw text.
//
// While the run works, the words say what the agent does at this moment:
// one tool call, or the text the agent writes now. Those words are plain
// text on one line, because each tool call replaces them, and a line that
// grew and shrank would move every row under it on each call. The part of
// the tool call that is code takes the mono font. They take
// `text-film`: the film colors of the ticket glimmer cross them without a
// pause, one sweep every two seconds, which says the agent works now. The
// sweep is CSS, and a person who asks for less motion reads the same words
// with no sweep.
export function AgentWords({ line, wrap = false, render }: AgentWordsProps) {
	const dot = line.asks && <AttentionDot label="The run waits for a person." />;
	const tone = line.asks ? "text-warning" : "text-fg-muted";
	if (wrap) {
		return (
			<>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center">{dot}</span>
				{line.working ? (
					<WorkingAgentText tooltip={false} className="min-w-0 flex-1 truncate" title={line.words}>
						{lineContent(line)}
					</WorkingAgentText>
				) : (
					<span className={cx("min-w-0 flex-1", tone)}>
						<ReadOnlyMarkdown markdown={line.words} className="agent-markdown" render={render} />
					</span>
				)}
			</>
		);
	}
	return (
		<>
			{dot}
			{line.working ? (
				<WorkingAgentText tooltip={false} className="truncate" title={line.words}>
					{lineContent(line)}
				</WorkingAgentText>
			) : (
				<span className={cx("truncate", tone)} title={line.words}>
					{line.words}
				</span>
			)}
		</>
	);
}
