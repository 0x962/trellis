import { Input } from "@trellis/ui";
import { useId, useState } from "react";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SavedMark } from "../SavedMark";
import { SettingsRow } from "../SettingsRow";

// The address a click on a pull request card opens. `{url}` in it stands for
// the URL of the pull request. A blur saves a changed template.
export function DiffTemplateField() {
	const { saved, draft, edit, save } = useSettingsDraft();
	const hintId = useId();
	const [savedAt, setSavedAt] = useState<number | null>(null);
	if (saved === undefined) return null;
	const value = draft.diffUrlTemplate ?? saved.diffUrlTemplate;

	const commit = async () => {
		if (value === saved.diffUrlTemplate) return;
		const stored = await save({ diffUrlTemplate: value });
		if (stored !== undefined) setSavedAt(Date.now());
	};

	return (
		<SettingsRow label="Show diff" hint="The address a click on a pull request card opens.">
			<div className="flex items-center gap-3">
				<Input
					label="Diff URL template"
					hideLabel
					autoComplete="off"
					spellCheck={false}
					aria-describedby={hintId}
					className="max-w-96 font-mono text-sm"
					value={value}
					onChange={(event) => edit({ diffUrlTemplate: event.target.value })}
					onBlur={() => void commit()}
				/>
				<SavedMark savedAt={savedAt} />
			</div>
			<p id={hintId} className="text-sm text-fg-muted">
				trellis puts the URL of the pull request in place of {"{url}"}. The default {"{url}"}/files opens the Files
				changed tab on GitHub.
			</p>
		</SettingsRow>
	);
}
