import { Pause, Play } from "@phosphor-icons/react";
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
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { AgentEnvironment } from "./components/AgentEnvironment";

// Status opens the page, so it takes the empty hash and the bare URL
// `/p/<path>/settings/manager` shows it.
const sections = [
	{ id: "", label: "Status" },
	{ id: "ade", label: "ADE" },
	{ id: "settings", label: "Settings" },
];

// True while the manager holds its terminal, so Pause has a terminal to
// close. An interrupted manager has none the server can find, so Play
// starts it again.
const atWork = (run: AgentRun) => run.state === "starting" || run.state === "running";

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const section = sections.some((item) => item.id === hash) ? hash : "";
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const [draft, setDraft] = useState(saved);
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: { project: project.path } }));
	// A project keeps one manager row, which every start takes again. The
	// list comes newest first, so the first row of the kind is that row.
	const manager = runs.data?.find((run) => run.kind === "manager");
	const active = manager !== undefined && atWork(manager);
	// True when Play continues the Claude session the manager had before its
	// pause. A manager with no session yet, or none that ran, starts new.
	const resumes = manager !== undefined && manager.sessionId !== null && manager.workspaceId !== null;
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
	// `newSession` true gives the manager a new session. A person sends it
	// from the lost-session notice, after a resume found none.
	const start = useMutation({
		mutationFn: (newSession: boolean) =>
			client.agentRuns.start({ project: project.path, personaId: saved.personaId!, newSession }),
		onSuccess: async (run, newSession) => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			const verb = resumes && !newSession ? "resume" : "start";
			if (run.state === "failed") toast.error(`Could not ${verb} the manager`, { description: run.error ?? undefined });
			else toast.success(`${run.name} ${verb}s now`);
		},
		onError: (error) => toast.error("Could not start the manager", { description: error.message }),
	});
	const pause = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: manager!.id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			toast.success(`${manager!.name} pauses now`);
		},
		onError: (error) => toast.error("Could not pause the manager", { description: error.message }),
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
						{/* One control runs the one manager of the project: Pause while it
						    holds a terminal, else Play. Pause closes the terminal and keeps
						    the session, and Play opens a terminal that continues that
						    session. */}
						{active ? (
							<Tooltip content="Pause the manager">
								<IconButton
									label="Pause manager"
									icon={<Pause weight="fill" />}
									size="md"
									variant="primary"
									disabled={readOnly || manager.state === "starting" || pause.isPending}
									onClick={() => pause.mutate()}
								/>
							</Tooltip>
						) : (
							<Tooltip content={resumes ? "Resume the manager" : "Start the manager"}>
								<IconButton
									label={resumes ? "Resume manager" : "Start manager"}
									icon={<Play weight="fill" />}
									size="md"
									variant="primary"
									disabled={
										readOnly ||
										dirty ||
										save.isPending ||
										!draft.enabled ||
										!persona ||
										runs.isPending ||
										runs.isError ||
										start.isPending
									}
									onClick={() => start.mutate(false)}
								/>
							</Tooltip>
						)}
					</>
				}
			>
				<PageTitle
					parent={
						<Link to="/p/$" params={{ _splat: projectSlashPath(project.path) }} search={{}}>
							{project.name}
						</Link>
					}
					title="Manager"
				/>
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
							{manager?.sessionLost && (
								<div className="flex flex-col gap-3 rounded-md border border-border p-3">
									<p className="text-sm">
										The manager could not resume its session. The error below names the session and where the agent ran.
										Start a new session? The new session does not hold the chat of the old one. Trellis reuses the
										workspace if it exists.
									</p>
									<Button
										variant="primary"
										align="start"
										disabled={readOnly || dirty || save.isPending || !draft.enabled || !persona}
										processing={start.isPending}
										onClick={() => start.mutate(true)}
									>
										Start a new session
									</Button>
								</div>
							)}
							{manager !== undefined && <AgentRunDetails run={manager} heading controls={false} />}
							{manager === undefined && !runs.isPending && !runs.isError && (
								<p className="text-sm text-fg-muted">This project has no manager yet. Press Play to start one.</p>
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
