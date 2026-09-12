import { ADE_FIELDS, ADE_VARIABLES, type AdeCommands as Commands, type ProjectManagerConfig } from "@trellis/api";
import { AgentCommandField } from "../AgentCommandField";

const groups = [
	{ title: "Session lifecycle", keys: ["start", "resume", "stop", "recover"] },
	{ title: "Agent interaction", keys: ["healthcheck", "send", "output"] },
	{ title: "Workspace integration", keys: ["projects", "open"] },
];
export function AdeCommands({
	commands,
	draft,
	saved,
	commit,
	setDraft,
}: {
	commands: Commands;
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
}) {
	return (
		<details className="manager-command-group">
			<summary>
				Advanced commands<span>Start, check, and control sessions</span>
			</summary>
			<div className="manager-command-body">
				{groups.map((group) => (
					<section key={group.title} aria-label={group.title} className="manager-command-section">
						<h3>{group.title}</h3>
						{group.keys
							.map((key) => ADE_FIELDS.find((field) => field.key === key)!)
							.map(({ key, label, hint }) => (
								<details key={key} className="manager-command-row">
									<summary>{label}</summary>
									<div className="manager-command-editor">
										<AgentCommandField
											label={`${label} command`}
											hint={hint}
											ade
											value={commands[key]}
											savedValue={saved.adeCommands?.[key] ?? commands[key]}
											onDraft={(value) => setDraft({ ...draft, adeCommands: { ...commands, [key]: value } })}
											onCommit={(value) => commit({ ...draft, adeCommands: { ...commands, [key]: value } })}
										/>
									</div>
								</details>
							))}
					</section>
				))}
				<details className="manager-command-row">
					<summary>Command variables and results</summary>
					<div className="manager-command-editor manager-settings-hint">
						<p>
							Commands run on the Trellis server. Each variable is a quoted shell argument, except {"{{target}}"} and{" "}
							{"{{createTarget}}"}, which supply host flags.
						</p>
						<p className="manager-command-variables">{ADE_VARIABLES.map((name) => `{{${name}}}`).join(", ")}</p>
						<p>Exit with code 0 on success. Write errors to stderr. Commands save when you leave the field.</p>
					</div>
				</details>
			</div>
		</details>
	);
}
