import { useQuery } from "@tanstack/react-query";
import type { AgentProjectSettings, AgentRunnerProjectsOutput, ProjectSummary } from "@trellis/api";
import { Checkbox, Input, Select, Switch } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { AgentFailure } from "../../../../agent/AgentFailure";
import { useAgentSettings } from "../../hooks/useAgentSettings";

export type AgentProjectRowProps = {
	project: ProjectSummary;
	// The runner's project list. Undefined while it loads or when the runner
	// cannot answer.
	runner: AgentRunnerProjectsOutput | undefined;
};

// The picker value that stores `supersetProjectId: null`: the server then
// uses the runner project that matches the project's declared repo.
const autoValue = "auto";

// The contract bounds of `maxConcurrent`.
const minBuilders = 1;
const maxBuilders = 20;

// One root project's agent settings. The switch, the picker, and the
// checkbox save at once. The two text fields save on blur and refuse a
// value the contract refuses. A save the runner refuses, and a manager
// start the runner refused, both state the reason under the fields.
export function AgentProjectRow({ project, runner }: AgentProjectRowProps) {
	const { orpc } = useApp();
	const { projectOf, saveProject, refusal } = useAgentSettings();
	const sessions = useQuery(orpc.agents.sessions.queryOptions({ input: { project: project.path } })).data?.sessions;
	const manager = (sessions ?? []).findLast((session) => session.role === "manager" && session.failure !== null);
	const row = projectOf(project.id);
	const [branch, setBranch] = useState<string | null>(null);
	const [limit, setLimit] = useState<string | null>(null);
	const [branchMessage, setBranchMessage] = useState<string | null>(null);
	const [limitMessage, setLimitMessage] = useState<string | null>(null);
	const save = (patch: Partial<AgentProjectSettings>) => void saveProject(project.id, patch);

	const matchId = runner?.matches.find((match) => match.projectId === project.id)?.runnerProjectId;
	const matched = runner?.projects.find((entry) => entry.id === matchId);
	const autoLabel = runner === undefined ? "Auto" : matched === undefined ? "Auto: no match" : `Auto: ${matched.name}`;
	const items = [
		{ value: autoValue, label: autoLabel },
		...(runner?.projects ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
	];

	const commitBranch = () => {
		const value = (branch ?? row.baseBranch).trim();
		if (value === "") {
			setBranchMessage("Enter a branch name.");
			return;
		}
		setBranchMessage(null);
		setBranch(null);
		if (value !== row.baseBranch) save({ baseBranch: value });
	};

	const commitLimit = () => {
		const value = Number(limit ?? row.maxConcurrent);
		if (!Number.isInteger(value) || value < minBuilders || value > maxBuilders) {
			setLimitMessage(`Enter a whole number from ${minBuilders} to ${maxBuilders}.`);
			return;
		}
		setLimitMessage(null);
		setLimit(null);
		if (value !== row.maxConcurrent) save({ maxConcurrent: value });
	};

	return (
		<fieldset
			aria-label={`${project.key} ${project.name}`}
			className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3"
		>
			<div className="flex items-center gap-2">
				<span className="font-mono text-xs text-fg-muted">{project.key}</span>
				<span className="min-w-0 truncate font-medium text-fg">{project.name}</span>
				<Switch
					label="Manager"
					checked={row.enabled}
					className="ml-auto cursor-pointer"
					onCheckedChange={(enabled) => save({ enabled })}
				/>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="flex flex-col gap-1">
					<span aria-hidden="true" className="text-sm text-fg-muted">
						Superset project
					</span>
					<Select
						label="Superset project"
						items={items}
						value={row.supersetProjectId ?? autoValue}
						className="cursor-pointer"
						onValueChange={(value) => save({ supersetProjectId: value === autoValue ? null : value })}
					/>
				</div>
				<Input
					label="Base branch"
					value={branch ?? row.baseBranch}
					invalid={branchMessage !== null}
					className="font-mono text-sm"
					onChange={(event) => setBranch(event.target.value)}
					onBlur={commitBranch}
				/>
				<Input
					label="Max builders"
					type="number"
					min={minBuilders}
					max={maxBuilders}
					value={limit ?? String(row.maxConcurrent)}
					invalid={limitMessage !== null}
					className="tabular"
					onChange={(event) => setLimit(event.target.value)}
					onBlur={commitLimit}
				/>
			</div>
			<Checkbox
				label="Remove workspace when Done"
				checked={row.removeWorkspaceOnDone}
				className="cursor-pointer self-start"
				onCheckedChange={(removeWorkspaceOnDone) => save({ removeWorkspaceOnDone })}
			/>
			{manager !== undefined && <AgentFailure session={manager} />}
			{[branchMessage, limitMessage, refusal?.projectId === project.id ? refusal.detail : null].map(
				(message) =>
					message !== null && (
						<p key={message} className="text-sm text-danger">
							{message}
						</p>
					),
			)}
		</fieldset>
	);
}
