import { createFileRoute } from "@tanstack/react-router";
import { AgentsOverview } from "../features/agent/AgentsOverview";
import { Topbar } from "../features/shell/Topbar";

// What the agents did and what the runner answered. A failed agent links
// here, and the browser lands on its session row.
export const Route = createFileRoute("/agents")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(context.orpc.agents.overview.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.projects.list.queryOptions({ input: {} })),
		]),
	component: AgentsPage,
});

function AgentsPage() {
	return (
		<>
			<Topbar>
				<h1 className="font-semibold text-fg text-md">Agents</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8">
				<AgentsOverview />
			</div>
		</>
	);
}
