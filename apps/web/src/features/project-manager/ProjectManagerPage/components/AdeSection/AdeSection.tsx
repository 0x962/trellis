import {
	type Ade,
	AGENT_COMMAND_VARIABLES,
	AGENT_LAUNCH_VARIABLES,
	DEFAULT_AGENT_RESUME_COMMAND,
	DEFAULT_AGENT_START_COMMAND,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
	unknownAgentCommandVariables,
	unknownLaunchVariables,
} from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { SettingsSection } from "../../../../project-settings/SettingsSection";
import { TemplateInput } from "../TemplateInput";

const ades: { value: Ade; label: string }[] = [
	{ value: "superset", label: "Superset" },
	{ value: "custom", label: "Custom command" },
];

// The host picker value that stores `supersetHostId: null`: every agent of
// the project then runs on the machine that runs the trellis server.
export const localValue = "local";
const localLabel = "This machine";

const variables = (names: readonly string[]) => names.map((name) => `{{${name}}}`).join(", ");

export type AdeSectionProps = {
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	// Sets the draft and saves it when it is valid.
	commit: (next: ProjectManagerConfig) => void;
	// Sets the draft alone, for a field that saves on blur.
	setDraft: (next: ProjectManagerConfig) => void;
	// The machines Superset can reach now, by id and name.
	hosts: { id: string; name: string }[];
	// Opens the folder picker for the project directory.
	chooseDirectory: () => void;
	choosing: boolean;
	saving: boolean;
};

// The execution settings of a project. trellis owns the run, its session
// id, and its prompt; every command here owns what runs. The ADE command
// makes a workspace and runs the agent command in it. The agent command is
// the program that is one agent.
export function AdeSection({
	draft,
	saved,
	commit,
	setDraft,
	hosts,
	chooseDirectory,
	choosing,
	saving,
}: AdeSectionProps) {
	// A project that names a machine the list does not hold keeps it as an
	// item, so the setting stays readable and the person sees which machine
	// to start.
	const hostItems = [
		{ value: localValue, label: localLabel },
		...hosts.map((entry) => ({ value: entry.id, label: entry.name })),
		...(draft.supersetHostId !== null && !hosts.some((entry) => entry.id === draft.supersetHostId)
			? [{ value: draft.supersetHostId, label: `${draft.supersetHostId} (offline)` }]
			: []),
	];
	const valid = ProjectManagerConfigSchema.safeParse(draft).success;
	return (
		<SettingsSection
			title="ADE"
			hint="The Agentic Development Environment that runs this project's agents. Changes save automatically."
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (valid) commit(draft);
				}}
			>
				<p className="text-sm text-fg-muted">ADE</p>
				<Select label="ADE" items={ades} value={draft.ade} onValueChange={(ade) => commit({ ...draft, ade })} />
				{draft.ade === "custom" && (
					<>
						<TemplateInput
							label="Command template"
							value={draft.adeCommand}
							unknown={unknownLaunchVariables}
							requiredMessage="Enter the command that starts one agent."
							hint={
								<>
									The command that makes a workspace and starts one agent. It takes {variables(AGENT_LAUNCH_VARIABLES)}.
								</>
							}
							onCommit={(adeCommand) => commit({ ...draft, adeCommand })}
						/>
						<TemplateInput
							label="Resume command template"
							value={draft.adeResumeCommand}
							unknown={unknownLaunchVariables}
							hint="The command that opens an agent again in the workspace it has, {{workspaceId}}. It takes the same variables. Leave it empty to run the command template again."
							onCommit={(adeResumeCommand) => commit({ ...draft, adeResumeCommand })}
						/>
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
				<TemplateInput
					label="Agent command"
					value={draft.agentCommand}
					unknown={unknownAgentCommandVariables}
					hint={
						<>
							The program that is one agent, in a new session. It takes {variables(AGENT_COMMAND_VARIABLES)}. Leave it
							empty to run <code>{DEFAULT_AGENT_START_COMMAND}</code>.
						</>
					}
					onCommit={(agentCommand) => commit({ ...draft, agentCommand })}
				/>
				<TemplateInput
					label="Agent resume command"
					value={draft.agentResumeCommand}
					unknown={unknownAgentCommandVariables}
					hint={
						<>
							The program that opens the agent again in its session, with {"{{resumeText}}"} as its first prompt. Leave
							it empty to run <code>{DEFAULT_AGENT_RESUME_COMMAND}</code>.
						</>
					}
					onCommit={(agentResumeCommand) => commit({ ...draft, agentResumeCommand })}
				/>
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
					invalid={!valid}
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
					disabled={choosing}
					aria-busy={choosing}
					onClick={chooseDirectory}
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
				{!valid && (
					<p role="alert" className="text-sm text-danger">
						Enter a whole number from 1 to 64.
					</p>
				)}
				{saving && (
					<p role="status" className="text-sm text-fg-muted">
						Save in progress…
					</p>
				)}
			</form>
		</SettingsSection>
	);
}
