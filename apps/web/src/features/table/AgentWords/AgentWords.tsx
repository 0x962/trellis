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
export function AgentWords({ line, wrap = false }: AgentWordsProps) {
	const dot = line.asks && <AttentionDot label="The run waits for a person." />;
	const tone = line.asks ? "text-warning" : "text-fg-muted";
	if (wrap) {
		return (
			<>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center">{dot}</span>
				<span className={cx("min-w-0 flex-1 wrap-anywhere", tone)}>{line.words}</span>
			</>
		);
	}
	return (
		<>
			{dot}
			<span className={cx("truncate", tone)} title={line.words}>
				{line.words}
			</span>
		</>
	);
}
