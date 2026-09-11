import type { AgentProjectSettings, AgentRunnerProjectsOutput, AgentSession, ProjectSummary } from "@trellis/api";
import { Checkbox, Input, Select, Switch } from "@trellis/ui";
import { useState } from "react";
import { AgentFailure } from "../../../../agent/AgentFailure";
import { AgentStateBadge } from "../../../../agent/AgentStateBadge";
import { useAgentSettings } from "../../hooks/useAgentSettings";
import { ManagerInstructions } from "./components/ManagerInstructions";

export type AgentProjectRowProps = {
	project: ProjectSummary;
	// The runner's project list. Undefined while it loads or when the runner
	// cannot answer.
	runner: AgentRunnerProjectsOutput | undefined;
	// The project's newest manager session, or undefined for a project whose
	// manager never started.
	manager: AgentSession | undefined;
};

// The picker value that stores `supersetProjectId: null`: the server then
// uses the runner project that matches the project's declared repo.
const autoValue = "auto";

// The contract bounds of `maxConcurrent`.
const minBuilders = 1;
const maxBuilders = 20;

// The branch the server falls back to for a project whose settings name
// none.
const fallbackBranch = "main";

// The branch each agent of the project starts from while the settings name
// none: the default branch of the Superset checkout the project uses, or
// the one branch every Superset checkout names, or `fallbackBranch`.
const defaultBranchOf = (runner: AgentRunnerProjectsOutput | undefined, chosenId: string | undefined) => {
	const chosen = runner?.projects.find((entry) => entry.id === chosenId)?.defaultBranch;
	if (chosen !== undefined && chosen !== null) return chosen;
	const branches = (runner?.projects ?? []).map((entry) => entry.defaultBranch);
	const named = new Set(branches.filter((branch) => branch !== null));
	return named.size === 1 ? [...named][0]! : fallbackBranch;
};

// One root project's agent settings, with the state of its manager. The
// switch, the picker, and the checkbox save at once. The two text fields
// save on blur and refuse a value the contract refuses.
export function AgentProjectRow({ project, runner, manager }: AgentProjectRowProps) {
	const { projectOf, saveProject } = useAgentSettings();
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

	// The field shows the branch the agents start from. A row without a
	// branch shows the default of its Superset checkout, and a save carries
	// only a branch the person typed.
	const shown = row.baseBranch ?? defaultBranchOf(runner, row.supersetProjectId ?? matchId);

	const commitBranch = () => {
		const value = (branch ?? shown).trim();
		if (value === "") {
			setBranchMessage("Enter a branch name.");
			return;
		}
		setBranchMessage(null);
		setBranch(null);
		if (value !== shown) save({ baseBranch: value });
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
				<span className="ml-auto flex min-w-0 items-center gap-2">
					{manager !== undefined && manager.state === "failed" && (
						<AgentFailure id={manager.id} error={manager.error} />
					)}
					<AgentStateBadge state={manager === undefined ? "off" : manager.state} />
					<Switch
						label="Manager"
						checked={row.enabled}
						className="cursor-pointer"
						onCheckedChange={(enabled) => save({ enabled })}
					/>
				</span>
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
						onValueChange={(value) => save({ supersetProjectId: value === autoValue ? null : value })}
					/>
				</div>
				<Input
					label="Base branch"
					value={branch ?? shown}
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
				className="self-start"
				onCheckedChange={(removeWorkspaceOnDone) => save({ removeWorkspaceOnDone })}
			/>
			<ManagerInstructions project={project} />
			{[branchMessage, limitMessage].map(
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
