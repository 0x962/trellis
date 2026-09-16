import {
	HARNESS_DEFAULT_MODELS,
	HARNESS_PRESETS,
	type HarnessPreset,
	modelsForHarness,
	type ProjectManagerConfig,
} from "@trellis/api";
import { Select } from "@trellis/ui";
import { useState } from "react";
import { SettingsSection } from "../../../SettingsSection";
import { AgentCommandField } from "../AgentCommandField";

const presets = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "opencode", label: "OpenCode" },
	{ value: "pi", label: "pi" },
	{ value: "custom", label: "Custom" },
];
export function HarnessSettings({
	draft,
	saved,
	commit,
	setDraft,
	readOnly,
}: {
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
	readOnly: boolean;
}) {
	const [revision, setRevision] = useState(0);
	return (
		<fieldset disabled={readOnly} className="manager-settings-groups">
			<SettingsSection title="Harness" hint="The agent program that does the work.">
				<Select
					label="Harness preset"
					items={presets}
					value={draft.harness.preset}
					onValueChange={(value) => {
						const preset = value as HarnessPreset;
						setRevision(revision + 1);
						commit({
							...draft,
							harness: { ...(preset === "custom" ? draft.harness : HARNESS_PRESETS[preset]), preset, model: undefined },
						});
					}}
				/>
				{draft.harness.preset !== "custom" && (
					<>
						<Select
							label="Model"
							alignItemWithTrigger={false}
							items={[
								{ value: "default", label: `Default (${HARNESS_DEFAULT_MODELS[draft.harness.preset]})` },
								...modelsForHarness(draft.harness.preset).map(({ id }) => ({ value: id, label: id })),
							]}
							value={draft.harness.model ?? "default"}
							onValueChange={(model) =>
								commit({ ...draft, harness: { ...draft.harness, model: model === "default" ? undefined : model } })
							}
						/>
						<p className="manager-settings-hint">
							A resume keeps its saved model unless you select another model for that resume.
						</p>
					</>
				)}
			</SettingsSection>
			{draft.harness.preset === "custom" && (
				<SettingsSection
					title="Agent commands"
					hint="Changes apply to the next start. Each command saves when you leave the field."
				>
					<AgentCommandField
						key={`start-${revision}`}
						label="Start command"
						value={draft.harness.startCommand}
						savedValue={saved.harness.startCommand}
						onDraft={(startCommand) => setDraft({ ...draft, harness: { ...draft.harness, startCommand } })}
						onCommit={(startCommand) => commit({ ...draft, harness: { ...draft.harness, startCommand } })}
						hint="Start a new agent. {{prompt}} contains its assignment. {{name}} contains its name."
					/>
					<AgentCommandField
						key={`resume-${revision}`}
						label="Resume command"
						value={draft.harness.resumeCommand}
						savedValue={saved.harness.resumeCommand}
						onDraft={(resumeCommand) => setDraft({ ...draft, harness: { ...draft.harness, resumeCommand } })}
						onCommit={(resumeCommand) => commit({ ...draft, harness: { ...draft.harness, resumeCommand } })}
						hint="Continue the manager after a pause. {{resumeText}} contains its next instruction."
					/>
				</SettingsSection>
			)}
		</fieldset>
	);
}
