import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PROJECT_MANAGER_CONFIG, type ProjectManagerConfig } from "@trellis/api";
import { Select } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { LaunchFields } from "../../../../agents/LaunchFields";
import { SettingsSection } from "../../../SettingsSection";

export function BuilderSettings({
	draft,
	commit,
}: {
	draft: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
}) {
	const { orpc } = useApp();
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const builder = draft.builder ?? { personaId: null, harness: DEFAULT_PROJECT_MANAGER_CONFIG.harness };
	return (
		<SettingsSection title="Automatic builder" hint="Select a builder before a ticket enters In Progress.">
			<div className="flex min-w-0 flex-col gap-2">
				<span className="text-sm text-fg-muted">Persona</span>
				<Select
					label="Persona"
					value={builder.personaId ?? "inherit"}
					items={[
						{ value: "inherit", label: "Use parent defaults" },
						...(personas.data ?? [])
							.filter((persona) => persona.kind === "builder")
							.map((persona) => ({ value: persona.id, label: persona.name })),
					]}
					onValueChange={(value) =>
						commit({
							...draft,
							builder: value === "inherit" ? null : { ...builder, personaId: value },
						})
					}
				/>
			</div>
			{builder.personaId !== null && (
				<LaunchFields
					harness={builder.harness}
					onChange={(harness) => commit({ ...draft, builder: { ...builder, personaId: builder.personaId!, harness } })}
				/>
			)}
			{personas.error && (
				<p role="alert" className="text-sm text-danger">
					{personas.error.message}
				</p>
			)}
		</SettingsSection>
	);
}
