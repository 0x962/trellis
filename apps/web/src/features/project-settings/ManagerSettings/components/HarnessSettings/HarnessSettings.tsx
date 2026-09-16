import { useQuery } from "@tanstack/react-query";
import {
	HARNESS_DEFAULT_MODELS,
	HARNESS_PRESETS,
	type HarnessPreset,
	modelsForHarness,
	type ProjectManagerConfig,
} from "@trellis/api";
import { Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
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
	const { orpc } = useApp();
	const accounts = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	// The accounts a project can name: the enabled ones of the selected
	// preset. The saved account stays in the list while it is disabled, so
	// the field shows what the project holds instead of a blank.
	const accountItems = [
		{ value: "default", label: "Harness default" },
		...(accounts.data ?? [])
			.filter(
				(account) => account.harness === draft.harness.preset && (account.enabled || account.id === draft.accountId),
			)
			.map((account) => ({ value: account.id, label: account.enabled ? account.name : `${account.name} (disabled)` })),
	];
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
							accountId: null,
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
						<Select
							label="Account"
							items={accountItems}
							value={draft.accountId ?? "default"}
							onValueChange={(value) => commit({ ...draft, accountId: value === "default" ? null : value })}
						/>
						<p className="manager-settings-hint">
							The login the manager and the workers of this project launch with. A running manager keeps its login until
							you restart it. Add and sign in accounts in Settings.
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
