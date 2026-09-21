import { AttentionDot, cx } from "@trellis/ui";
import type { TicketAgentLine } from "../utils/agentLines";

type AgentWordsProps = {
	line: TicketAgentLine;
	// True on the agent line of the epic table: the words wrap onto as many
	// lines as they need, and the dot gets a 16 px slot of its own, so the
	// words start where the number of a pull request row starts. False on
	// the phone row, where the words stay on one line and truncate.
	wrap?: boolean;
};

// The dot and the words of one agent line. The epic table draws them on the
// line under a ticket row, and a phone row draws them on its second line.
//
// While the run works, the words say what the agent does at this moment,
// and they take `text-glimmer`: a band of light crosses them every seven
// seconds, which says the agent still works. The band is CSS, and a person
// who asks for less motion reads the same words with no band. The working
// words stay on one line even where a message wraps, because each tool call
// replaces them, and a line that grew and shrank would move every row under
// it on each call.
export function AgentWords({ line, wrap = false }: AgentWordsProps) {
	const dot = line.asks && <AttentionDot label="The run waits for a person." />;
	const tone = line.asks ? "text-warning" : "text-fg-muted";
	if (wrap) {
		return (
			<>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center">{dot}</span>
				<span
					className={cx("min-w-0 flex-1", line.working ? "truncate text-glimmer" : cx("wrap-anywhere", tone))}
					title={line.working ? line.words : undefined}
				>
					{line.words}
				</span>
			</>
		);
	}
	return (
		<>
			{dot}
			<span className={cx("truncate", line.working ? "text-glimmer" : tone)} title={line.words}>
				{line.words}
			</span>
		</>
	);
}
