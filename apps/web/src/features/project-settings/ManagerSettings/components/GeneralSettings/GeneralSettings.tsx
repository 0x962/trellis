import { FolderOpen } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectManagerConfig } from "@trellis/api";
import { IconButton, Input, Select, Switch, Tooltip, toast } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { SettingsSection } from "../../../SettingsSection";

export function GeneralSettings({
	draft,
	saved,
	commit,
	setDraft,
	readOnly,
	saving,
	hasParent,
}: {
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
	readOnly: boolean;
	saving: boolean;
	hasParent: boolean;
}) {
	const { client, orpc } = useApp();
	const folder = useMutation({
		mutationFn: () => {
			const desktop = (window as Window & { trellisDesktop?: { chooseDirectory: () => Promise<string | null> } })
				.trellisDesktop;
			return desktop ? desktop.chooseDirectory() : client.system.chooseDirectory();
		},
		onSuccess: (directory) => {
			if (directory !== null) commit({ ...draft, directory });
		},
		onError: (error) => toast.error("Could not open the folder selector", { description: error.message }),
	});
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const invalidConcurrency = !Number.isInteger(draft.concurrency) || draft.concurrency < 1 || draft.concurrency > 64;
	const invalidDirectory = draft.directory !== "" && !draft.directory.startsWith("/");
	return (
		<fieldset disabled={readOnly} className="manager-settings-groups">
			<SettingsSection title="Manager" hint="Choose the persona that directs work for this project.">
				<Select
					label="Manager persona"
					placeholder="Select a manager persona"
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
			<SettingsSection title="General" hint="Trellis runs agents locally in this repository.">
				<div className="manager-settings-field">
					<div className="manager-directory-row">
						<Input
							label="Project directory"
							placeholder="Choose a local repository"
							value={draft.directory}
							onChange={(event) => setDraft({ ...draft, directory: event.target.value })}
							onBlur={() => {
								if (draft.directory !== saved.directory) commit(draft);
							}}
							invalid={invalidDirectory}
						/>
						<Tooltip content="Choose a directory on this machine">
							<IconButton
								label="Choose project directory"
								icon={<FolderOpen />}
								disabled={folder.isPending}
								onClick={() => folder.mutate()}
							/>
						</Tooltip>
					</div>
					<p className="manager-settings-hint">
						{hasParent
							? "Leave blank to use the nearest parent project's repository directory."
							: "Choose a repository for the manager and its local workspaces."}
					</p>
					{invalidDirectory && (
						<p role="alert" className="text-sm text-danger">
							Use an absolute directory path.
						</p>
					)}
				</div>
				<div className="manager-settings-field">
					<Input
						label="Concurrency"
						type="number"
						min={1}
						max={64}
						step={1}
						value={draft.concurrency || ""}
						onChange={(event) => setDraft({ ...draft, concurrency: Number(event.target.value) })}
						onBlur={() => {
							if (draft.concurrency !== saved.concurrency) commit(draft);
						}}
						invalid={invalidConcurrency}
					/>
					<p className="manager-settings-hint">Maximum active ticket agents. The manager does not count.</p>
					{invalidConcurrency && (
						<p role="alert" className="text-sm text-danger">
							Enter a whole number from 1 to 64.
						</p>
					)}
				</div>
			</SettingsSection>
			<SettingsSection title="Automatic dispatch" hint="Send ticket events and periodic heartbeats to the manager.">
				<Switch
					label="Automatic dispatch"
					checked={!draft.dispatchPaused}
					disabled={saving}
					onCheckedChange={(enabled) => commit({ ...draft, dispatchPaused: !enabled })}
				/>
				<p className="manager-settings-hint">
					Pause automatic dispatch to keep new messages queued. The current process continues.
				</p>
			</SettingsSection>
		</fieldset>
	);
}
