import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { Play } from "lucide-react";
import { useCopyAgentCommand } from "../../../../hooks/useCopyAgentCommand";

export type StalledActionsProps = {
	ticket: TicketSummary;
	onMoveToTodo: () => void;
};

// A stalled ticket is a dead agent session: start a new agent on it, or give
// it up and put it back in Todo.
export function StalledActions({ ticket, onMoveToTodo }: StalledActionsProps) {
	const copy = useCopyAgentCommand();
	return (
		<>
			<Button size="sm" icon={<Play />} data-start-with-agent="" onClick={() => void copy(ticket.identifier)}>
				Start with agent
			</Button>
			<Button size="sm" variant="quiet" data-move-to-todo="" onClick={onMoveToTodo}>
				Move to Todo
			</Button>
		</>
	);
}
