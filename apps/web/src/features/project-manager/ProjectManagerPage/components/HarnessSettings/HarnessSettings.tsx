import { HARNESS_PRESETS, type HarnessPreset, type ProjectManagerConfig } from "@trellis/api";
import { Select } from "@trellis/ui";
import { useState } from "react";
import { SettingsSection } from "../../../../project-settings/SettingsSection";
import { AgentCommandField } from "../AgentCommandField";

const presets = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "agy", label: "agy" },
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
							harness: { ...(preset === "custom" ? draft.harness : HARNESS_PRESETS[preset]), preset },
						});
					}}
				/>
				<p className="manager-settings-hint">
					A preset fills the commands below. Edit them to choose flags, models, or another executable.
				</p>
			</SettingsSection>
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
				{["codex", "agy", "opencode", "pi"].includes(draft.harness.preset) && (
					<p className="manager-settings-hint">
						This preset resumes the most recent conversation. Set a specific conversation in the resume command when
						agents share a directory.
					</p>
				)}
			</SettingsSection>
		</fieldset>
	);
}
