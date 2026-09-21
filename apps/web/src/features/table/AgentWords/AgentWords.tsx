import { AttentionDot, cx } from "@trellis/ui";
import type { TicketAgentLine } from "../utils/agentLines";

// The dot and the words of one agent line. The epic table draws them on the
// line under a ticket row, and a phone row draws them on its second line.
export function AgentWords({ line }: { line: TicketAgentLine }) {
	return (
		<>
			{line.asks && <AttentionDot label="The run waits for a person." />}
			<span className={cx("truncate", line.asks ? "text-warning" : "text-fg-muted")} title={line.words}>
				{line.words}
			</span>
		</>
	);
}
