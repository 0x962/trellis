import type { AgentRun } from "@trellis/api";
import { Sheet } from "@trellis/ui";
import { AgentRunDetails } from "../AgentRunDetails";

// One agent in a slideout, for a screen that lists several of them. A screen
// that shows one agent alone draws AgentRunDetails in the page instead.
export function AgentRunSheet({ run, onClose }: { run: AgentRun; onClose: () => void }) {
	return (
		<Sheet open title={run.name} titleClassName="text-md font-medium" onOpenChange={(open) => !open && onClose()}>
			<div className="p-6 max-md:p-4">
				<AgentRunDetails run={run} />
			</div>
		</Sheet>
	);
}
