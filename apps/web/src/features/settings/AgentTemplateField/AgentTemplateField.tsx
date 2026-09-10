import { Textarea } from "@trellis/ui";
import { useId, useState } from "react";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SavedMark } from "../SavedMark";
import { SettingsRow } from "../SettingsRow";

// The command Start with agent copies. `{brief}` in it stands for the
// ticket brief. A blur saves a changed template.
export function AgentTemplateField() {
	const { saved, draft, edit, save } = useSettingsDraft();
	const hintId = useId();
	const [savedAt, setSavedAt] = useState<number | null>(null);
	if (saved === undefined) return null;
	const value = draft.startWithAgentTemplate ?? saved.startWithAgentTemplate;

	const commit = async () => {
		if (value === saved.startWithAgentTemplate) return;
		const stored = await save({ startWithAgentTemplate: value });
		if (stored !== undefined) setSavedAt(Date.now());
	};

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
				onBlur={() => void commit()}
			/>
			<div className="flex items-center justify-between gap-3">
				<p id={hintId} className="text-sm text-fg-muted">
					trellis puts the ticket brief in place of {"{brief}"}. Example: {'claude "{brief}"'}.
				</p>
				<SavedMark savedAt={savedAt} />
			</div>
		</SettingsRow>
	);
}
