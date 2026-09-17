import { FolderOpen } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectManagerConfig } from "@trellis/api";
import { IconButton, Input, Select, Tooltip, toast } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { SettingsSection } from "../../../SettingsSection";

export function GeneralSettings({
	draft,
	saved,
	commit,
	setDraft,
	readOnly,
	hasParent,
}: {
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
	readOnly: boolean;
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
	const invalidDirectory = draft.directory !== "" && !draft.directory.startsWith("/");
	return (
		<fieldset disabled={readOnly} className="manager-settings-groups">
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
							: "Choose a repository for the copilot and its local workspaces."}
					</p>
					{invalidDirectory && (
						<p role="alert" className="text-sm text-danger">
							Use an absolute directory path.
						</p>
					)}
				</div>
			</SettingsSection>
		</fieldset>
	);
}
