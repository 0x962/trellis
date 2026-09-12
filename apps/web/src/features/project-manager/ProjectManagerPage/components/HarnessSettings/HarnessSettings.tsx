import {
	DEFAULT_AGENT_RESUME_COMMAND,
	DEFAULT_AGENT_START_COMMAND,
	HARNESS_FIELDS,
	HARNESS_VARIABLES,
	type HarnessCommands,
	type ProjectManagerConfig,
	SUPERSET_HARNESS_COMMANDS,
	TMUX_HARNESS_COMMANDS,
} from "@trellis/api";
import { Select } from "@trellis/ui";
import { useState } from "react";
import { AgentCommandField } from "../AgentCommandField";

const presets = [
	{ value: "superset", label: "Superset" },
	{ value: "tmux", label: "tmux" },
	{ value: "custom", label: "Custom commands" },
];
const sameCommands = (left: HarnessCommands, right: HarnessCommands) =>
	HARNESS_FIELDS.every(({ key }) => left[key] === right[key]);

export function HarnessSettings({
	draft,
	saved,
	commit,
}: {
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
}) {
	const [presetRevision, setPresetRevision] = useState(0);
	const [customSelected, setCustomSelected] = useState(false);
	const commands =
		draft.harnessCommands ?? (draft.ade === "superset" ? SUPERSET_HARNESS_COMMANDS : TMUX_HARNESS_COMMANDS);
	const preset = sameCommands(commands, SUPERSET_HARNESS_COMMANDS)
		? "superset"
		: sameCommands(commands, TMUX_HARNESS_COMMANDS)
			? "tmux"
			: "custom";
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-fg-muted">Harness preset</p>
			<Select
				label="Harness preset"
				items={presets}
				value={customSelected ? "custom" : preset}
				onValueChange={(value) => {
					setCustomSelected(value === "custom");
					if (value === "custom") {
						commit({ ...draft, harnessCommands: { ...commands } });
						return;
					}
					setPresetRevision((revision) => revision + 1);
					commit({
						...draft,
						ade: value === "superset" ? "superset" : "custom",
						harnessCommands: { ...(value === "superset" ? SUPERSET_HARNESS_COMMANDS : TMUX_HARNESS_COMMANDS) },
						agentCommand: DEFAULT_AGENT_START_COMMAND,
						agentResumeCommand: DEFAULT_AGENT_RESUME_COMMAND,
					});
				}}
			/>
			<p className="text-sm text-fg-muted">
				A preset fills every command below. Edit any command to customize it. Changes apply to the next start.
			</p>
			<AgentCommandField
				key={`agent-${presetRevision}`}
				label="Agent start command"
				value={draft.agentCommand}
				savedValue={saved.agentCommand}
				onCommit={(agentCommand) => commit({ ...draft, agentCommand, harnessCommands: { ...commands } })}
				hint="The executable and flags for a new agent. Use {{prompt}} for the assignment and {{name}} for its name."
			/>
			<AgentCommandField
				key={`resume-${presetRevision}`}
				label="Manager resume command"
				value={draft.agentResumeCommand}
				savedValue={saved.agentResumeCommand}
				onCommit={(agentResumeCommand) => commit({ ...draft, agentResumeCommand, harnessCommands: { ...commands } })}
				hint="The executable and flags for a manager restart. Use {{prompt}} for the assignment and {{name}} for its name."
			/>
			{HARNESS_FIELDS.map(({ key, label, hint }) => (
				<details key={`${key}-${presetRevision}`} className="rounded-md border border-border p-3">
					<summary className="cursor-pointer text-sm text-fg">{label}</summary>
					<div className="mt-3">
						<AgentCommandField
							label={`${label} command`}
							hint={hint}
							harness
							value={commands[key]}
							savedValue={saved.harnessCommands?.[key] ?? commands[key]}
							onCommit={(value) => commit({ ...draft, harnessCommands: { ...commands, [key]: value } })}
						/>
					</div>
				</details>
			))}
			<details className="text-sm text-fg-muted">
				<summary className="cursor-pointer">Command variables and results</summary>
				<p className="mt-3">
					Commands run on the Trellis server. Each variable is one quoted shell argument, except {"{{target}}"}, which
					supplies the host flags.
				</p>
				<p className="mt-2">{HARNESS_VARIABLES.map((name) => `{{${name}}}`).join(", ")}</p>
				<p className="mt-2">
					Exit with code 0 on success. Write errors to stderr. Multiline commands save on blur or Ctrl+Enter
					(Command+Enter on macOS).
				</p>
			</details>
		</div>
	);
}
