import { TerminalWindow, X } from "@phosphor-icons/react";
import { type AgentRun, sessionStatusLabels } from "@trellis/api";
import { Avatar, Badge, IconButton, Tooltip } from "@trellis/ui";
import { pageSheetActions } from "../../../../../stores/pageSheetStore";
import { agentKindOf } from "../../../agentKindOf";
import { agentMarkState } from "../../../agentMarkState";
import { agentProfileOf } from "../../../agentProfileOf";
import { agentRunStatus } from "../../../agentRunStatus";
import { harnessLabel } from "../../../harnessPresets";

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function TicketAgentRun({
	run,
	disabled,
	onUnassign,
}: {
	run: AgentRun;
	disabled: boolean;
	onUnassign?: () => void;
}) {
	const status = agentRunStatus(run);
	const profile = agentProfileOf(run.harness);
	const harness = run.harness ? (run.harness.preset === "custom" ? "Custom" : harnessLabel(run.harness.preset)) : null;
	const details = [harness, profile.model, profile.effort].filter(Boolean).join(" · ");
	const openLabel = `Open ${run.name} session from ${dateFormat.format(new Date(run.createdAt))}`;
	return (
		<div className="flex min-w-0 items-center gap-2 py-1">
			<Avatar
				kind="agent"
				name={run.name}
				agentKind={agentKindOf(run.kind)}
				agentProfile={profile}
				state={agentMarkState(run)}
				status={status !== "paused" && (run.assigned || status === "failed") ? status : undefined}
				className="focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
			/>
			<div className="min-w-0 flex-1">
				<p className="break-words text-sm font-medium text-fg">{run.name}</p>
				<p className="break-words text-xs text-fg-muted">{details}</p>
				{run.assigned ? (
					<p className="text-xs text-fg-muted">{status === "paused" ? "Paused" : sessionStatusLabels[status]}</p>
				) : (
					<div className="flex flex-wrap items-center gap-2">
						<time dateTime={run.createdAt} className="text-xs text-fg-muted tabular">
							{dateFormat.format(new Date(run.createdAt))}
						</time>
						{status === "failed" && <Badge tone="bad">{sessionStatusLabels[status]}</Badge>}
					</div>
				)}
			</div>
			<Tooltip content={openLabel}>
				<IconButton
					label={openLabel}
					icon={<TerminalWindow />}
					data-agent-session={run.id}
					onClick={() => pageSheetActions.openSession(run.id)}
				/>
			</Tooltip>
			{onUnassign && (
				<Tooltip content="Unassign agent">
					<IconButton label="Unassign agent" icon={<X />} disabled={disabled} onClick={onUnassign} />
				</Tooltip>
			)}
		</div>
	);
}
