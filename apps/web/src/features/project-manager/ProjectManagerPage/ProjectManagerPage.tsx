import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type AgentRun, DEFAULT_PROJECT_MANAGER_CONFIG, type Project, ProjectManagerConfigSchema } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { AgentRunSheet } from "../../agents/AgentRunSheet";
import { RepoSettings } from "../../project-settings/RepoSettings";
import { SettingsSection } from "../../project-settings/SettingsSection";
import { Topbar } from "../../shell/Topbar";

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const [draft, setDraft] = useState(saved);
	const [selected, setSelected] = useState<AgentRun | null>(null);
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: { project: project.path } }));
	const managers = runs.data?.filter((run) => run.kind === "manager") ?? [];
	const active = managers.some((run) => ["starting", "running", "interrupted"].includes(run.state));
	const dirty =
		draft.personaId !== saved.personaId ||
		draft.concurrency !== saved.concurrency ||
		draft.directory !== saved.directory;
	const save = useMutation({
		mutationFn: () => client.projects.update({ project: project.path, managerConfig: draft }),
		onSuccess: async (project) => {
			setDraft(project.managerConfig!);
			await queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() });
		},
	});
	const start = useMutation({
		mutationFn: () => client.agentRuns.start({ project: project.path, personaId: saved.personaId! }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
		},
	});
	const persona = personas.data?.find((item) => item.id === draft.personaId);
	const readOnly = project.archivedAt !== null;
	return (
		<>
			<Topbar>
				<h1 className="text-lg font-semibold text-fg">{project.name} › Manager</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-5">
				<div className="mx-auto flex max-w-160 flex-col gap-8 py-8">
					<fieldset disabled={readOnly || save.isPending} className="contents">
						<SettingsSection
							title="Manager setup"
							hint="These settings apply to this project. Save changes before you start its manager."
						>
							<form
								className="flex flex-col gap-4"
								onSubmit={(event) => {
									event.preventDefault();
									if (!save.isPending && ProjectManagerConfigSchema.safeParse(draft).success) save.mutate();
								}}
							>
								<p className="text-sm text-fg-muted">Manager persona</p>
								<Select
									label="Manager persona"
									placeholder="Select a manager persona"
									value={draft.personaId ?? ""}
									items={(personas.data ?? [])
										.filter((item) => item.kind === "manager")
										.map((item) => ({ value: item.id, label: item.name }))}
									onValueChange={(value) => setDraft({ ...draft, personaId: value })}
									disabled={personas.isPending}
								/>
								{personas.isError && (
									<p role="alert" className="text-sm text-danger">
										Could not load personas.{" "}
										<Button variant="quiet" onClick={() => void personas.refetch()}>
											Retry
										</Button>
									</p>
								)}
								<Link to="/ai/personas" className="text-sm text-accent underline">
									Edit personas and instructions
								</Link>
								<Input
									label="Concurrency"
									type="number"
									min={1}
									max={64}
									step={1}
									value={draft.concurrency || ""}
									onChange={(event) => setDraft({ ...draft, concurrency: Number(event.target.value) })}
								/>
								<p className="text-sm text-fg-muted">
									Maximum active ticket agents in this project. The manager does not count.
								</p>
								<Input
									label="Project directory"
									placeholder="/Users/you/projects/repository"
									value={draft.directory}
									onChange={(event) => setDraft({ ...draft, directory: event.target.value })}
								/>
								<p className="text-sm text-fg-muted">
									The manager starts in this directory. Leave it empty to use its agent workspace.
								</p>
								<Button type="submit" disabled={!dirty || !ProjectManagerConfigSchema.safeParse(draft).success}>
									Save manager settings
								</Button>
								{save.isError && (
									<p role="alert" className="text-sm text-danger">
										Could not save manager settings. {save.error.message}
									</p>
								)}
								{save.isSuccess && !dirty && (
									<p role="status" className="text-sm text-fg-muted">
										Manager settings saved.
									</p>
								)}
							</form>
						</SettingsSection>
						<RepoSettings project={project} />
					</fieldset>
					<SettingsSection title="Manager" hint="Open the manager to read its output, send follow-ups, or stop it.">
						{runs.isPending && (
							<p role="status" className="text-sm text-fg-muted">
								Load manager…
							</p>
						)}
						{runs.isError && (
							<p role="alert" className="text-sm text-danger">
								Could not load manager.{" "}
								<Button variant="quiet" onClick={() => void runs.refetch()}>
									Retry
								</Button>
							</p>
						)}
						{managers.map((run) => (
							<Button key={run.id} align="start" variant="quiet" onClick={() => setSelected(run)}>
								{run.name} · {run.state}
							</Button>
						))}
						<Button
							disabled={readOnly || active || dirty || !persona || start.isPending || runs.isPending || runs.isError}
							onClick={() => start.mutate()}
						>
							Start manager
						</Button>
						{start.isError && (
							<p role="alert" className="text-sm text-danger">
								Could not start manager. {start.error.message}
							</p>
						)}
						{start.data?.state === "failed" && (
							<p role="alert" className="text-sm text-danger">
								Could not start manager. {start.data.error}
							</p>
						)}
					</SettingsSection>
					<SettingsSection
						title="Workflow"
						hint="The manager reads project statuses and uses the shared launch command."
					>
						<Link
							to="/p/$"
							params={{ _splat: `${projectSlashPath(project.path)}/settings` }}
							className="text-sm text-accent underline"
						>
							Project statuses and ticket template
						</Link>
						<Link to="/settings" hash="agents" className="text-sm text-accent underline">
							Agent launch command
						</Link>
					</SettingsSection>
				</div>
			</div>
			{selected && <AgentRunSheet run={selected} onClose={() => setSelected(null)} />}
		</>
	);
}
