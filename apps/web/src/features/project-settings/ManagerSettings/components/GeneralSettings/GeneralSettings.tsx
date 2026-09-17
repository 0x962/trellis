import { useQuery } from "@tanstack/react-query";
import type { ProjectManagerConfig } from "@trellis/api";
import { Select } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
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
	const { orpc } = useApp();
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	return (
		<fieldset disabled={readOnly} className="min-w-0">
			<SettingsSection title="Copilot" hint="The copilot stays available and acts when you ask.">
				<Select
					label="Copilot persona"
					placeholder="Select a copilot persona"
					value={draft.personaId ?? ""}
					items={(personas.data ?? [])
						.filter((item) => item.kind === "manager")
						.map((item) => ({ value: item.id, label: item.name }))}
					onValueChange={(value) => commit({ ...draft, personaId: value })}
					disabled={personas.isPending}
				/>
				{personas.isError && (
					<p role="alert" className="text-sm text-danger">
						Could not load personas: {personas.error.message}
					</p>
				)}
			</SettingsSection>
		</fieldset>
	);
}
