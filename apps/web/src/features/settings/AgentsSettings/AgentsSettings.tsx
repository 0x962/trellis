import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { AgentRunner, RunnerReason } from "@trellis/api";
import { Select, Switch } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { runnerReasonLine } from "../../agent/utils/runnerReasonLine";
import { SettingsRow } from "../SettingsRow";
import { AgentProjectRow } from "./components/AgentProjectRow";
import { useAgentSettings } from "./hooks/useAgentSettings";

const runners: { value: AgentRunner; label: string }[] = [{ value: "superset", label: "Superset" }];

// The global agent switch, the runner, and one block per open root project.
// A manager serves a root and every sub-project under it, so a sub-project
// gets no block. The runner project list fills each block's picker; a
// runner that cannot answer leaves each picker on Auto. Turning the switch
// on checks every project it turns on, so a project the runner cannot serve
// states the reason here instead of failing without a word.
export function AgentsSettings() {
	const { orpc } = useApp();
	const { saved, save, refusal } = useAgentSettings();
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	const runner = useQuery({ ...orpc.agents.runnerProjects.queryOptions({}), retry: false });
	if (saved === undefined || projects === undefined) return null;

	const roots = projects.filter((project) => project.parentId === null && project.archivedAt === null);
	const reason =
		runner.error instanceof ORPCError && runner.error.code === "RUNNER_UNAVAILABLE"
			? (runner.error.data as { reason: RunnerReason }).reason
			: null;

	return (
		<SettingsRow label="Agents" hint="Each project gets a manager agent. The manager hands tickets to builder agents.">
			<Switch
				label="Turn on agents"
				checked={saved.enabled}
				className="cursor-pointer self-start"
				onCheckedChange={(enabled) => void save((current) => ({ ...current, enabled }))}
			/>
			<p className="text-sm text-fg-muted">Off: no manager wakes and no builder starts. Running builders continue.</p>
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className="text-sm text-fg-muted">
					Runner
				</span>
				<Select
					label="Runner"
					items={runners}
					value={saved.runner}
					className="cursor-pointer"
					onValueChange={(next) => void save((current) => ({ ...current, runner: next }))}
				/>
			</div>
			{reason !== null && (
				<p role="alert" className="text-sm text-danger">
					{runnerReasonLine[reason]}
				</p>
			)}
			{refusal !== null && (
				<p role="alert" className="text-sm text-danger">
					{refusal.detail}
				</p>
			)}
			{roots.map((project) => (
				<AgentProjectRow key={project.id} project={project} runner={runner.data} />
			))}
		</SettingsRow>
	);
}
