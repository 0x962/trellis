import { useQuery } from "@tanstack/react-query";
import { ADE_PRESETS, type Ade, type ProjectManagerConfig } from "@trellis/api";
import { Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { SettingsSection } from "../../../../project-settings/SettingsSection";
import { AdeCommands } from "../AdeCommands";
import { AgentCommandField } from "../AgentCommandField";

const presets = [
	{ value: "native", label: "Trellis (local)" },
	{ value: "superset", label: "Superset" },
	{ value: "terminal", label: "Terminal" },
	{ value: "tmux", label: "tmux" },
	{ value: "custom", label: "Custom" },
];
export function AgentEnvironment({
	active,
	readOnly,
	draft,
	saved,
	commit,
	setDraft,
}: {
	active: boolean;
	readOnly: boolean;
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
}) {
	const { orpc } = useApp();
	const [revision, setRevision] = useState(0);
	const hosts = useQuery({
		...orpc.agents.runnerHosts.queryOptions({}),
		retry: false,
		enabled: active && draft.ade === "superset",
		staleTime: 5 * 60_000,
	});
	const online = hosts.data?.hosts ?? [];
	const hostItems = [
		{ value: "local", label: "This machine" },
		...online.map((entry) => ({ value: entry.id, label: entry.name })),
		...(draft.supersetHostId !== null && !online.some((entry) => entry.id === draft.supersetHostId)
			? [{ value: draft.supersetHostId, label: `${draft.supersetHostId} (offline)` }]
			: []),
	];
	const commands =
		draft.adeCommands ?? (draft.ade === "custom" || draft.ade === "native" ? null : ADE_PRESETS[draft.ade]);
	return (
		<fieldset disabled={readOnly} className="manager-settings-groups">
			<SettingsSection title="ADE" hint="The environment that opens and manages your agent sessions.">
				<Select
					label="ADE preset"
					items={presets}
					value={draft.ade}
					onValueChange={(value) => {
						const ade = value as Ade;
						setRevision(revision + 1);
						commit({
							...draft,
							ade,
							adeCommands: ade === "native" ? null : ade === "custom" ? commands : { ...ADE_PRESETS[ade] },
						});
					}}
				/>
				<p className="manager-settings-hint">
					{draft.ade === "native"
						? "Trellis owns the terminal and workspace on this Mac."
						: "A preset fills the session commands. Your harness and its commands stay as configured."}
				</p>
				{draft.ade === "terminal" && (
					<p className="manager-settings-hint">
						Terminal.app opens a persistent tmux session on this Mac. Install tmux before you start an agent.
					</p>
				)}
				{draft.ade === "tmux" && (
					<p className="manager-settings-hint">
						tmux keeps sessions active on the Trellis server. Install tmux before you start an agent.
					</p>
				)}
			</SettingsSection>
			{draft.ade === "superset" && (
				<SettingsSection title="Superset host" hint="Choose the machine that runs this project's agents.">
					<Select
						label="Superset host"
						items={hostItems}
						value={draft.supersetHostId ?? "local"}
						onValueChange={(value) => commit({ ...draft, supersetHostId: value === "local" ? null : value })}
					/>
					<p className="manager-settings-hint">
						Superset must be signed in on that machine. Agents on another machine need a Trellis URL they can reach.
					</p>
					{hosts.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not load Superset hosts: {hosts.error.message}
						</p>
					)}
				</SettingsSection>
			)}
			{draft.ade === "native" ? null : commands ? (
				<AdeCommands
					key={revision}
					commands={commands}
					draft={draft}
					saved={saved}
					commit={commit}
					setDraft={setDraft}
				/>
			) : (
				<SettingsSection title="Custom launch" hint="The commands that open your configured environment.">
					<AgentCommandField
						label="Launch command"
						ade
						value={draft.adeCommand}
						savedValue={saved.adeCommand}
						hint="Use {{agentCommand}} to run the selected harness."
						onDraft={(adeCommand) => setDraft({ ...draft, adeCommand })}
						onCommit={(adeCommand) => commit({ ...draft, adeCommand })}
					/>
					<AgentCommandField
						label="Resume session command"
						ade
						value={draft.adeResumeCommand}
						savedValue={saved.adeResumeCommand}
						hint="Open the agent in its existing workspace."
						onDraft={(adeResumeCommand) => setDraft({ ...draft, adeResumeCommand })}
						onCommit={(adeResumeCommand) => commit({ ...draft, adeResumeCommand })}
					/>
				</SettingsSection>
			)}
		</fieldset>
	);
}
