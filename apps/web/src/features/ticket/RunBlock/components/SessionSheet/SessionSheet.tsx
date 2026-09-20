import type { AgentRun } from "@trellis/api";
import { SessionConversation } from "../../../../sessions/SessionConversation";
import { PageSheet } from "../../../../shell/PageSheet";

export type SessionSheetProps = {
	run: AgentRun;
	open: boolean;
	onClose: () => void;
};

// The session of the run that holds the ticket, in a `PageSheet` over the
// ticket. The sheet stays mounted while it is closed, so it slides in on the
// first open too.
export function SessionSheet({ run, open, onClose }: SessionSheetProps) {
	return (
		<PageSheet open={open} onClose={onClose} title={run.name}>
			{open && <SessionConversation key={run.id} run={run} />}
		</PageSheet>
	);
}
