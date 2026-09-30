import type { TicketSummary } from "@trellis/api";
import { Avatar } from "@trellis/ui";
import { agentKindOf } from "../agentKindOf";
import { agentMarkState } from "../agentMarkState";
import { agentProfileOf } from "../agentProfileOf";
import { useAssignedRun } from "../useAssignedRun";
import { UnassignedAgent } from "./components/UnassignedAgent";

// The fixed slot keeps the row stable when an assignment arrives.
export function ActorAvatar({
	ticket,
	readOnly = false,
}: {
	ticket: Pick<TicketSummary, "id" | "identifier" | "status" | "project" | "completedAt">;
	readOnly?: boolean;
}) {
	const assignment = useAssignedRun(ticket.id);
	const run = assignment.data;
	const canStart =
		!readOnly &&
		ticket.completedAt === null &&
		ticket.status.category !== "done" &&
		ticket.status.category !== "canceled";
	return (
		<span className="inline-flex size-5 shrink-0 items-center justify-center pointer-coarse:size-11">
			{run ? (
				<Avatar
					kind="agent"
					name={run.name}
					agentKind={agentKindOf(run.kind)}
					agentProfile={agentProfileOf(run.harness)}
					state={agentMarkState(run)}
				/>
			) : assignment.isSuccess && canStart ? (
				<UnassignedAgent identifier={ticket.identifier} projectKey={ticket.project.key} />
			) : null}
		</span>
	);
}
