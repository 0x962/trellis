import { Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	type AgentRun,
	DEFAULT_PROJECT_MANAGER_CONFIG,
	type Project,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
} from "@trellis/api";
import { Button, IconButton, PowerToggle, Select, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { RepoSettings } from "../../project-settings/RepoSettings";
import { SettingsSection } from "../../project-settings/SettingsSection";
import { Topbar } from "../../shell/Topbar";
import { AgentEnvironment } from "./components/AgentEnvironment";

// Status opens the page, so it takes the empty hash and the bare URL
// `/p/<path>/settings/manager` shows it.
const sections = [
	{ id: "", label: "Status" },
	{ id: "ade", label: "ADE" },
	{ id: "settings", label: "Settings" },
];

// True while the agent still holds its terminal.
const atWork = (run: AgentRun) => run.state === "starting" || run.state === "running" || run.state === "interrupted";

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const section = sections.some((item) => item.id === hash) ? hash : "";
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const [draft, setDraft] = useState(saved);
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: { project: project.path } }));
	// A project keeps one manager, so the list holds at most one row of that
	// kind. A start takes that row again instead of making another.
	const manager = runs.data?.find((run) => run.kind === "manager");
	const active = manager !== undefined && atWork(manager);
	const dirty =
		draft.personaId !== saved.personaId ||
		draft.concurrency !== saved.concurrency ||
		draft.directory !== saved.directory ||
		draft.agentCommand !== saved.agentCommand ||
		draft.agentResumeCommand !== saved.agentResumeCommand ||
		JSON.stringify(draft.harnessCommands) !== JSON.stringify(saved.harnessCommands);
	const save = useMutation({
		scope: { id: `project-manager-${project.id}` },
		mutationFn: (managerConfig: ProjectManagerConfig) =>
			client.projects.update({ project: project.path, managerConfig }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() });
		},
		onError: (error) => toast.error("Could not save the manager settings", { description: error.message }),
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
		onError: (error) => toast.error("Could not open the folder selector", { description: error.message }),
	});
	const start = useMutation({
		mutationFn: () => client.agentRuns.start({ project: project.path, personaId: saved.personaId! }),
		onSuccess: async (run) => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			if (run.state === "failed") toast.error("Could not start the manager", { description: run.error ?? undefined });
			else toast.success(`${run.name} starts now`);
		},
		onError: (error) => toast.error("Could not start the manager", { description: error.message }),
	});
	const persona = personas.data?.find((item) => item.id === draft.personaId);
	const readOnly = project.archivedAt !== null;

	return (
		<>
			<Topbar
				actions={
					<>
						{/* The agents toggle is green metal while agents run and red metal while
						    they are off. The tooltip says the state in words. */}
						<Tooltip content={draft.enabled ? "Agents are on" : "Agents are off"}>
							<PowerToggle
								label="Agents"
								on={draft.enabled}
								disabled={readOnly}
								onChange={(enabled) => commit({ ...draft, enabled })}
							/>
						</Tooltip>
						<IconButton
							label="Start manager"
							icon={<Plus />}
							size="md"
							variant="primary"
							disabled={
								readOnly ||
								active ||
								dirty ||
								save.isPending ||
								!draft.enabled ||
								!persona ||
								runs.isPending ||
								runs.isError
							}
							onClick={() => start.mutate()}
						/>
					</>
				}
			>
				<span className="sr-only">{project.name} › Manager</span>
			</Topbar>
			<div className="project-settings-layout">
				<nav aria-label="Manager settings" className="project-settings-nav">
					<p className="project-settings-nav-title">Manager settings</p>
					<ul className="project-settings-nav-list">
						{sections.map(({ id, label }) => (
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
									{label}
								</Link>
							</li>
						))}
					</ul>
				</nav>
				<div className="project-settings-content">
					<div hidden={section !== ""} className="project-settings-page">
						<section aria-label="Status" className="project-settings-section">
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
							{manager !== undefined && <AgentRunDetails run={manager} heading />}
							{manager === undefined && !runs.isPending && !runs.isError && (
								<p className="text-sm text-fg-muted">This project has no manager yet.</p>
							)}
							{!draft.enabled && (
								<p className="text-sm text-fg-muted">
									Agents are off. Turn them on in the header to start the manager. An agent that already runs keeps
									running.
								</p>
							)}
						</section>
					</div>
					<div hidden={section !== "ade"} className="project-settings-page">
						<AgentEnvironment
							active={section === "ade"}
							readOnly={readOnly}
							saved={saved}
							draft={draft}
							setDraft={setDraft}
							commit={commit}
							choosingDirectory={folder.isPending}
							chooseDirectory={() => folder.mutate()}
							saving={save.isPending}
							saveError={save.error}
							savedSuccessfully={save.isSuccess}
						/>
					</div>
					<div hidden={section !== "settings"} className="project-settings-page">
						<fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-10">
							<SettingsSection title="Manager" hint="The persona that Start manager runs.">
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
							</SettingsSection>
							<RepoSettings project={project} />
						</fieldset>
					</div>
				</div>
			</div>
		</>
	);
}
