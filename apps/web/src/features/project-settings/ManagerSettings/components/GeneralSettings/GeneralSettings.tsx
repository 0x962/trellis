import type { ProjectManagerConfig } from "@trellis/api";
import { Textarea } from "@trellis/ui";
import { SettingsSection } from "../../../SettingsSection";

export function GeneralSettings({
	draft,
	commit,
	readOnly,
}: {
	draft: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	readOnly: boolean;
}) {
	return (
		<fieldset disabled={readOnly} className="min-w-0">
			<SettingsSection title="Copilot" hint="The copilot stays available and acts when you ask.">
				<Textarea
					label="Copilot instruction"
					rows={10}
					maxLength={200000}
					value={draft.instruction}
					onChange={(event) => commit({ ...draft, instruction: event.target.value })}
				/>
			</SettingsSection>
		</fieldset>
	);
}
