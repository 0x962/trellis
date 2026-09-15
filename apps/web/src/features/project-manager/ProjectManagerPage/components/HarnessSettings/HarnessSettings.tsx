import { HARNESS_PRESETS, type HarnessPreset, type ProjectManagerConfig } from "@trellis/api";
import { Input, Select } from "@trellis/ui";
import { useState } from "react";
import { SettingsSection } from "../../../../project-settings/SettingsSection";
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
	const saveModel = () => {
		const model = draft.harness.model?.trim() || undefined;
		const next = { ...draft, harness: { ...draft.harness, model } };
		if (model !== saved.harness.model) commit(next);
		else setDraft(next);
	};
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
							harness: { ...(preset === "custom" ? draft.harness : HARNESS_PRESETS[preset]), preset },
						});
					}}
				/>
				{draft.harness.preset !== "custom" && (
					<>
						<Input
							label="Model"
							value={draft.harness.model ?? ""}
							onChange={(event) => setDraft({ ...draft, harness: { ...draft.harness, model: event.target.value } })}
							onBlur={saveModel}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									saveModel();
								}
							}}
						/>
						<p className="manager-settings-hint">
							Leave blank to use the harness default. OpenCode and pi accept provider/model.
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
