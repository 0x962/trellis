import { Button, Textarea } from "@trellis/ui";
import { useId } from "react";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SettingsRow } from "../SettingsRow";

// The command Start with agent copies. `{brief}` in it stands for the ticket
// brief, which the command reads through the CLI.
export function AgentTemplateField() {
	const { saved, draft, edit, save } = useSettingsDraft();
	const hintId = useId();
	if (saved === undefined) return null;
	const value = draft.startWithAgentTemplate ?? saved.startWithAgentTemplate;

	return (
		<SettingsRow label="Start with agent" hint="The command the Start with agent button copies.">
			<Textarea
				label="Start with agent template"
				hideLabel
				rows={3}
				spellCheck={false}
				aria-describedby={hintId}
				className="font-mono text-sm"
				value={value}
				onChange={(event) => edit({ startWithAgentTemplate: event.target.value })}
			/>
			<p id={hintId} className="text-sm text-fg-muted">
				{"{brief}"} is where the ticket brief goes, such as {'claude "{brief}"'}.
			</p>
			<Button onClick={() => void save({})} className="self-start">
				Save
			</Button>
		</SettingsRow>
	);
}
