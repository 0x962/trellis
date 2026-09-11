import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	type AgentRun,
	DEFAULT_PROJECT_MANAGER_CONFIG,
	type Project,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
} from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { Bot, GitBranch, Settings2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { AgentRunSheet } from "../../agents/AgentRunSheet";
import { RepoSettings } from "../../project-settings/RepoSettings";
import { SettingsSection } from "../../project-settings/SettingsSection";
import { Topbar } from "../../shell/Topbar";

const sections = [
	{ id: "", label: "General", icon: Settings2 },
	{ id: "repositories", label: "Repositories", icon: GitBranch },
	{ id: "manager", label: "Manager", icon: Bot },
];

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const section = sections.some((item) => item.id === hash) ? hash : "";
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
		scope: { id: `project-manager-${project.id}` },
		mutationFn: (managerConfig: ProjectManagerConfig) =>
			client.projects.update({ project: project.path, managerConfig }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() });
		},
	});
	const commit = (next: ProjectManagerConfig) => {
		setDraft(next);
		if (ProjectManagerConfigSchema.safeParse(next).success) save.mutate(next);
	};
	const folder = useMutation({
		mutationFn: () => client.system.chooseDirectory(),
		onSuccess: (directory) => {
			if (directory !== null) commit({ ...draft, directory });
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
			<div className="project-settings-layout">
				<nav aria-label="Manager settings" className="project-settings-nav">
					<p className="project-settings-nav-title">Manager settings</p>
					<ul className="project-settings-nav-list">
						{sections.map(({ id, label, icon: Icon }) => (
							<li key={id}>
								<Link
									to="/p/$"
									params={{ _splat: `${projectSlashPath(project.path)}/settings/manager` }}
									search={{}}
									hash={id}
									hashScrollIntoView={false}
									activeOptions={{ exact: true, includeHash: true }}
									aria-current={section === id ? "page" : undefined}
									className="project-settings-nav-link"
								>
									<Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
									{label}
								</Link>
							</li>
						))}
					</ul>
				</nav>
				<div className="project-settings-content">
					<div hidden={section !== ""} className="project-settings-page">
						<fieldset disabled={readOnly} className="min-w-0">
							<SettingsSection title="General" hint="Changes save automatically.">
								<form
									className="flex flex-col gap-4"
									onSubmit={(event) => {
										event.preventDefault();
										if (dirty) commit(draft);
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
										onValueChange={(value) => commit({ ...draft, personaId: value })}
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
										disabled={folder.isPending}
										aria-busy={folder.isPending}
										onClick={() => folder.mutate()}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												folder.mutate();
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
									{folder.isError && (
										<p role="alert" className="text-sm text-danger">
											Could not open the folder selector. {folder.error.message}
										</p>
									)}
									{!ProjectManagerConfigSchema.safeParse(draft).success && (
										<p role="alert" className="text-sm text-danger">
											Enter a whole number from 1 to 64.
										</p>
									)}
									{save.isPending && (
										<p role="status" className="text-sm text-fg-muted">
											Save in progress…
										</p>
									)}
									{save.isError && (
										<p role="alert" className="text-sm text-danger">
											Could not save manager settings. {save.error.message}
											<Button variant="quiet" onClick={() => commit(draft)}>
												Retry
											</Button>
										</p>
									)}
									{save.isSuccess && !save.isPending && !dirty && (
										<p role="status" className="text-sm text-fg-muted">
											Manager settings saved.
										</p>
									)}
								</form>
							</SettingsSection>
						</fieldset>
					</div>
					<div hidden={section !== "repositories"} className="project-settings-page">
						<fieldset disabled={readOnly} className="min-w-0">
							<RepoSettings project={project} />
						</fieldset>
					</div>
					<div hidden={section !== "manager"} className="project-settings-page">
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
								disabled={
									readOnly ||
									active ||
									dirty ||
									save.isPending ||
									!persona ||
									start.isPending ||
									runs.isPending ||
									runs.isError
								}
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
					</div>
				</div>
			</div>
			{selected && <AgentRunSheet run={selected} onClose={() => setSelected(null)} />}
		</>
	);
}
