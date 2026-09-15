import { Play, Stop } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	type AgentRun,
	DEFAULT_PROJECT_MANAGER_CONFIG,
	type Project,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
} from "@trellis/api";
import { Button, IconButton, Switch, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { GeneralSettings } from "./components/GeneralSettings";
import { HarnessSettings } from "./components/HarnessSettings";
import { managerResumes } from "./managerResumes";

// The empty hash opens Operation at `/p/<path>/settings/manager`.
const sections = [
	{ id: "", label: "Operation" },
	{ id: "settings", label: "General" },
	{ id: "harness", label: "Harness" },
];

// A starting or running manager holds a process that Stop can close.
const atWork = (run: AgentRun) => run.runtime === "native" && (run.state === "starting" || run.state === "running");

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const section = sections.some((item) => item.id === hash) ? hash : "";
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const [draft, setDraft] = useState(saved);
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: { project: project.path } }));
	// The list orders manager assignments from newest to oldest.
	const manager = runs.data?.find((run) => run.kind === "manager");
	const active = manager !== undefined && atWork(manager);
	// True when Play continues the Claude session the manager had before its
	// pause. A manager with no session yet, or none that ran, starts new.
	const resumes = managerResumes(manager);
	const parsedDraft = ProjectManagerConfigSchema.safeParse(draft);
	const dirty = !parsedDraft.success || JSON.stringify(parsedDraft.data) !== JSON.stringify(saved);
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
		const parsed = ProjectManagerConfigSchema.safeParse(next);
		if (parsed.success) save.mutate(parsed.data);
	};

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
			toast.success(`${manager!.name} stops now`);
		},
		onError: (error) => toast.error("Could not stop the manager", { description: error.message }),
	});
	const persona = personas.data?.find((item) => item.id === draft.personaId);
	const readOnly = project.archivedAt !== null;

	return (
		<>
			<Topbar
				actions={
					active ? (
						<Tooltip content="Stop the manager process">
							<IconButton
								label="Stop manager"
								icon={<Stop weight="fill" />}
								size="sm"
								variant="default"
								disabled={readOnly || manager.state === "starting" || pause.isPending}
								onClick={() => pause.mutate()}
							/>
						</Tooltip>
					) : (
						<Tooltip content={resumes ? "Resume the manager" : "Start the manager"}>
							<IconButton
								label={resumes ? "Resume manager" : "Start manager"}
								icon={<Play weight="fill" />}
								size="sm"
								variant="default"
								disabled={
									readOnly || dirty || save.isPending || !persona || runs.isPending || runs.isError || start.isPending
								}
								onClick={() => start.mutate(false)}
							/>
						</Tooltip>
					)
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
			<div className="page-card project-settings-layout">
				<nav aria-label="Manager navigation" className="project-settings-nav">
					<p className="project-settings-nav-title">Manager</p>
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
							<Switch
								label="Automatic dispatch"
								checked={!draft.dispatchPaused}
								disabled={readOnly || save.isPending}
								onCheckedChange={(enabled) => commit({ ...draft, dispatchPaused: !enabled })}
							/>
							<p className="text-sm text-fg-muted">
								Pause automatic dispatch to keep new messages queued. The current process continues.
							</p>
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
							{manager?.sessionLost && manager.runtime === "native" && (
								<div className="flex flex-col gap-3 rounded-md border border-border p-3">
									<p className="text-sm">
										The manager could not resume its session. The error below names the session and where the agent ran.
										Start a new session? The new session does not hold the chat of the old one. Trellis reuses the
										workspace if it exists.
									</p>
									<Button
										variant="primary"
										align="start"
										disabled={readOnly || dirty || save.isPending || !persona}
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
						</section>
					</div>
					<div hidden={section !== "harness"} className="project-settings-page">
						<HarnessSettings readOnly={readOnly} draft={draft} saved={saved} commit={commit} setDraft={setDraft} />
					</div>
					<div hidden={section !== "settings"} className="project-settings-page">
						<GeneralSettings
							project={project}
							readOnly={readOnly}
							draft={draft}
							saved={saved}
							commit={commit}
							setDraft={setDraft}
						/>
					</div>
					{section !== "" && (
						<p role={save.error ? "alert" : "status"} className="manager-save-status">
							{save.isPending
								? "Save in progress…"
								: save.error
									? save.error.message
									: dirty
										? "Unsaved changes"
										: "All changes saved"}
						</p>
					)}
				</div>
			</div>
		</>
	);
}
