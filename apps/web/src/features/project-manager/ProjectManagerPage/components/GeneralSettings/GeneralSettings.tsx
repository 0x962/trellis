import { FolderOpen } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Project, ProjectManagerConfig } from "@trellis/api";
import { Checkbox, IconButton, Input, Select, Tooltip, toast } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { RepoSettings } from "../../../../project-settings/RepoSettings";
import { SettingsSection } from "../../../../project-settings/SettingsSection";

export function GeneralSettings({
	project,
	draft,
	saved,
	commit,
	setDraft,
	readOnly,
}: {
	project: Project;
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
	readOnly: boolean;
}) {
	const { client, orpc } = useApp();
	const folder = useMutation({
		mutationFn: () => {
			const desktop = (window as Window & { trellisDesktop?: { chooseDirectory: () => Promise<string | null> } })
				.trellisDesktop;
			return desktop ? desktop.chooseDirectory() : client.system.chooseDirectory();
		},
		onSuccess: (directory) => {
			if (directory !== null)
				commit({ ...draft, directory, trustedDirectory: directory === draft.directory && draft.trustedDirectory });
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
			<SettingsSection title="General" hint="These settings apply with any ADE or harness.">
				<div className="manager-settings-field">
					<div className="manager-directory-row">
						<Input
							label="Project directory"
							placeholder="Use the agent workspace"
							value={draft.directory}
							onChange={(event) => setDraft({ ...draft, directory: event.target.value, trustedDirectory: false })}
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
						The manager starts in this directory on its host. Leave it empty to use its agent workspace.
					</p>
					{draft.ade === "native" && (
						<div className="flex flex-col gap-2">
							<Checkbox
								label="Trust this repository"
								checked={draft.trustedDirectory}
								disabled={!draft.directory || invalidDirectory}
								onCheckedChange={(trustedDirectory) => commit({ ...draft, trustedDirectory })}
							/>
							<p className="manager-settings-hint">
								Agent tools still ask for permission. A directory change clears this trust.
							</p>
						</div>
					)}
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
			<RepoSettings project={project} />
		</fieldset>
	);
}
