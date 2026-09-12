import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	type Ade,
	AGENT_LAUNCH_VARIABLES,
	type AgentRun,
	DEFAULT_PROJECT_MANAGER_CONFIG,
	type Project,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
	unknownLaunchVariables,
} from "@trellis/api";
import { Button, Input, Select, Switch, toast } from "@trellis/ui";
import { Bot, GitBranch, Settings2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { RepoSettings } from "../../project-settings/RepoSettings";
import { SettingsSection } from "../../project-settings/SettingsSection";
import { Topbar } from "../../shell/Topbar";

// Status opens the page, so it takes the empty hash and the bare URL
// `/p/<path>/settings/manager` shows it.
const sections = [
	{ id: "", label: "Status", icon: Bot },
	{ id: "ade", label: "ADE", icon: Settings2 },
	{ id: "repositories", label: "Repositories", icon: GitBranch },
];

const ades: { value: Ade; label: string }[] = [
	{ value: "superset", label: "Superset" },
	{ value: "custom", label: "Custom command" },
];

// The host picker value that stores `supersetHostId: null`: every agent of
// the project then runs on the machine that runs the trellis server.
const localValue = "local";
const localLabel = "This machine";

// True while the agent still holds its terminal.
const atWork = (run: AgentRun) => run.state === "starting" || run.state === "running" || run.state === "interrupted";

export function ProjectManagerPage({ project }: { project: Project }) {
	const { client, orpc, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const section = sections.some((item) => item.id === hash) ? hash : "";
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const [draft, setDraft] = useState(saved);
	const [command, setCommand] = useState<string | null>(null);
	const [commandMessage, setCommandMessage] = useState<string | null>(null);
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: { project: project.path } }));
	// The host list comes from `superset hosts list`, which spawns a process,
	// so only the ADE page reads it and the answer holds for five
	// minutes. A runner that cannot answer leaves the picker with This
	// machine alone.
	const hosts = useQuery({
		...orpc.agents.runnerHosts.queryOptions({}),
		retry: false,
		enabled: section === "ade",
		staleTime: 5 * 60_000,
	});
	// A project keeps one manager, so the list holds at most one row of that
	// kind. A start takes that row again instead of making another.
	const manager = runs.data?.find((run) => run.kind === "manager");
	const active = manager !== undefined && atWork(manager);
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
	const commitCommand = () => {
		const value = (command ?? draft.adeCommand).trim();
		if (value === "") {
			setCommandMessage("Enter the command that starts one agent.");
			return;
		}
		const unknown = unknownLaunchVariables(value);
		if (unknown.length > 0) {
			setCommandMessage(`Unknown variables: ${unknown.join(", ")}`);
			return;
		}
		setCommandMessage(null);
		setCommand(null);
		if (value !== draft.adeCommand) commit({ ...draft, adeCommand: value });
	};
	const persona = personas.data?.find((item) => item.id === draft.personaId);
	const readOnly = project.archivedAt !== null;

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
		<>
			<Topbar
				actions={
					<>
						<Switch
							label="Agents"
							checked={draft.enabled}
							disabled={readOnly}
							onCheckedChange={(enabled) => commit({ ...draft, enabled })}
						/>
						<Button
							variant="primary"
							disabled={readOnly || active || dirty || !draft.enabled || !persona || runs.isPending || runs.isError}
							processing={start.isPending || save.isPending}
							onClick={() => start.mutate()}
						>
							Start manager
						</Button>
					</>
				}
			>
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
						<SettingsSection title="Status" hint="What the manager is doing, and what it read last.">
							<p className="text-sm text-fg-muted">Manager persona</p>
							<Select
								label="Manager persona"
								placeholder="Select a manager persona"
								value={draft.personaId ?? ""}
								items={(personas.data ?? [])
									.filter((item) => item.kind === "manager")
									.map((item) => ({ value: item.id, label: item.name }))}
								onValueChange={(value) => commit({ ...draft, personaId: value })}
								disabled={readOnly || personas.isPending}
							/>
							{personas.isError && (
								<p role="alert" className="text-sm text-danger">
									Could not load personas.{" "}
									<Button variant="quiet" onClick={() => void personas.refetch()}>
										Retry
									</Button>
								</p>
							)}
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
						</SettingsSection>
					</div>
					<div hidden={section !== "ade"} className="project-settings-page">
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
									<p className="text-sm text-fg-muted">ADE</p>
									<Select
										label="ADE"
										items={ades}
										value={draft.ade}
										onValueChange={(ade) => commit({ ...draft, ade })}
									/>
									{draft.ade === "custom" && (
										<>
											<Input
												label="Command template"
												value={command ?? draft.adeCommand}
												invalid={commandMessage !== null}
												className="font-mono text-sm"
												onChange={(event) => setCommand(event.target.value)}
												onBlur={commitCommand}
											/>
											<p className="text-sm text-fg-muted">
												The command that starts one agent. It takes the variables{" "}
												{AGENT_LAUNCH_VARIABLES.map((name) => `{{${name}}}`).join(", ")}.
											</p>
											{commandMessage !== null && (
												<p role="alert" className="text-sm text-danger">
													{commandMessage}
												</p>
											)}
										</>
									)}
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
								</form>
							</SettingsSection>
						</fieldset>
					</div>
					<div hidden={section !== "repositories"} className="project-settings-page">
						<fieldset disabled={readOnly} className="min-w-0">
							<RepoSettings project={project} />
						</fieldset>
					</div>
				</div>
			</div>
		</>
	);
}
