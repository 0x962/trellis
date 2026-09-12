import { useQuery } from "@tanstack/react-query";
import { type ProjectManagerConfig, ProjectManagerConfigSchema } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { SettingsSection } from "../../../../project-settings/SettingsSection";
import { HarnessSettings } from "../HarnessSettings";

// The host picker value that stores `supersetHostId: null`: every agent of
// the project then runs on the machine that runs the trellis server.
const localValue = "local";
const localLabel = "This machine";

export function AgentEnvironment({
	active,
	readOnly,
	saved,
	draft,
	setDraft,
	commit,
	choosingDirectory,
	chooseDirectory,
	saving,
	saveError,
	savedSuccessfully,
}: {
	active: boolean;
	readOnly: boolean;
	saved: ProjectManagerConfig;
	draft: ProjectManagerConfig;
	setDraft: (value: ProjectManagerConfig) => void;
	commit: (value: ProjectManagerConfig) => void;
	choosingDirectory: boolean;
	chooseDirectory: () => void;
	saving: boolean;
	saveError: Error | null;
	savedSuccessfully: boolean;
}) {
	const { orpc } = useApp();
	const dirty = draft.concurrency !== saved.concurrency || draft.directory !== saved.directory;
	// The host list comes from `superset hosts list`, which spawns a process,
	// so only the ADE page reads it and the answer holds for five
	// minutes. A runner that cannot answer leaves the picker with This
	// machine alone.
	const hosts = useQuery({
		...orpc.agents.runnerHosts.queryOptions({}),
		retry: false,
		enabled: active,
		staleTime: 5 * 60_000,
	});
	// The list holds the machines Superset can reach now. A project that
	// names a machine the list does not hold keeps it as an item, so the
	// setting stays readable and the person sees which machine to start.
	const online = hosts.data?.hosts ?? [];
	const hostItems = [
		{ value: localValue, label: localLabel },
		...online.map((entry) => ({ value: entry.id, label: entry.name })),
		...(draft.supersetHostId !== null && !online.some((entry) => entry.id === draft.supersetHostId)
			? [{ value: draft.supersetHostId, label: `${draft.supersetHostId} (offline)` }]
			: []),
	];

	return (
		<fieldset disabled={readOnly} className="min-w-0">
			<SettingsSection
				title="ADE"
				hint="The Agentic Development Environment that runs this project's agents. Changes save automatically."
			>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (dirty) commit(draft);
					}}
				>
					<HarnessSettings draft={draft} saved={saved} commit={commit} />
					<p className="text-sm text-fg-muted">Superset host</p>
					<Select
						label="Superset host"
						items={hostItems}
						value={draft.supersetHostId ?? localValue}
						onValueChange={(value) => commit({ ...draft, supersetHostId: value === localValue ? null : value })}
					/>
					<p className="text-sm text-fg-muted">
						The machine that runs every agent of this project. Superset must be signed in on it.
					</p>
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
						invalid={!ProjectManagerConfigSchema.safeParse(draft).success}
					/>
					<p className="text-sm text-fg-muted">
						Maximum active ticket agents in this project. The manager does not count.
					</p>
					<Input
						label="Project directory"
						placeholder="Select a folder"
						value={draft.directory}
						readOnly
						className="cursor-pointer"
						disabled={choosingDirectory}
						aria-busy={choosingDirectory}
						onClick={() => chooseDirectory()}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								chooseDirectory();
							}
						}}
					/>
					<p className="text-sm text-fg-muted">
						The manager starts in this directory. Leave it empty to use its agent workspace.
					</p>
					{draft.directory && (
						<Button variant="quiet" align="start" onClick={() => commit({ ...draft, directory: "" })}>
							Clear directory
						</Button>
					)}
					{!ProjectManagerConfigSchema.safeParse(draft).success && (
						<p role="alert" className="text-sm text-danger">
							Enter a whole number from 1 to 64.
						</p>
					)}
					<p role={saveError ? "alert" : "status"} className="min-h-5 text-sm text-fg-muted">
						{saving ? "Save in progress…" : saveError ? saveError.message : savedSuccessfully ? "Saved" : ""}
					</p>
				</form>
			</SettingsSection>
		</fieldset>
	);
}
