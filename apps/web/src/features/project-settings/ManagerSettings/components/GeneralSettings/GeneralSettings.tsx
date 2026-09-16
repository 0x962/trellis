import { FolderOpen } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectManagerConfig } from "@trellis/api";
import { ConfirmDialog, IconButton, Input, Select, Switch, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { SettingsSection } from "../../../SettingsSection";

// What changes when a sub-project gets its own manager. The dialog lists
// these before the first persona of a sub-project is saved.
const subprojectManagerNotes = [
	"The parent manager receives no events from this sub-project and starts no agents for its tickets.",
	"The parent manager receives one event about this change.",
	"Start the new manager on the Manager page of this sub-project.",
	"Persona and harness stay local to this sub-project. An empty project directory uses the nearest parent directory.",
	"Clear the persona to return this sub-project to the parent manager.",
];

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
	// The persona a sub-project picked while it still has no manager. The
	// pick waits in the dialog; Cancel drops it and the picker keeps its
	// saved empty value.
	const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null);
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
					onValueChange={(value) => {
						if (hasParent && saved.personaId === null) setPendingPersonaId(value);
						else commit({ ...draft, personaId: value });
					}}
					disabled={personas.isPending}
				/>
				<ConfirmDialog
					open={pendingPersonaId !== null}
					title="Turn on a manager for this sub-project?"
					description="This sub-project gets its own manager. The parent manager stops managing it."
					confirmLabel="Turn on manager"
					onConfirm={() => {
						commit({ ...draft, personaId: pendingPersonaId });
						setPendingPersonaId(null);
					}}
					onCancel={() => setPendingPersonaId(null)}
				>
					<ul className="flex list-disc flex-col gap-2 pl-4 text-sm text-fg-muted">
						{subprojectManagerNotes.map((note) => (
							<li key={note}>{note}</li>
						))}
					</ul>
				</ConfirmDialog>
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
