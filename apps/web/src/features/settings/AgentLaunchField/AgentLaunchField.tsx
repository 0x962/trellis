import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AGENT_LAUNCH_VARIABLES,
	DEFAULT_AGENT_LAUNCH_COMMAND,
	hasStandaloneLaunchHyphen,
	type Settings,
	unknownLaunchVariables,
} from "@trellis/api";
import { Button, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SavedMark } from "../SavedMark";
import { SettingsRow } from "../SettingsRow";

export function AgentLaunchField() {
	const { client, orpc, queryClient } = useApp();
	const savedKey = orpc.settings.get.queryKey({});
	const { data: saved } = useQuery(orpc.settings.get.queryOptions({}));
	const [template, setTemplate] = useState<string | null>(null);
	const value = template ?? saved?.agentLaunchCommand ?? DEFAULT_AGENT_LAUNCH_COMMAND;
	const unknown = unknownLaunchVariables(value);
	const standaloneHyphen = hasStandaloneLaunchHyphen(value);
	const invalid = !value.trim() || unknown.length > 0 || standaloneHyphen;
	const save = useMutation({
		scope: { id: "agent-launch-command" },
		mutationFn: (command: string) =>
			client.settings.set({
				...queryClient.getQueryData<Settings>(savedKey)!,
				agentLaunchCommand: command,
			}),
		onSuccess: (settings, sent) => {
			queryClient.setQueryData(savedKey, settings);
			setTemplate((current) => (current === sent ? null : current));
		},
	});
	const commit = () => {
		if (!invalid && (save.isPending || value.trim() !== (saved?.agentLaunchCommand ?? DEFAULT_AGENT_LAUNCH_COMMAND)))
			save.mutate(value);
	};
	return (
		<SettingsRow
			label="Agent launch"
			hint="Choose the command Trellis uses to open an agent. Changes save automatically."
		>
			<Textarea
				label="Command template"
				rows={6}
				required
				maxLength={20000}
				spellCheck={false}
				value={value}
				disabled={!saved}
				invalid={invalid}
				onChange={(event) => setTemplate(event.target.value)}
				onBlur={commit}
				className="font-mono text-sm"
			/>
			<p className="text-sm text-fg-muted">
				Superset opens a tracked terminal. Custom commands run in a persistent terminal with status, output, and
				follow-ups.
			</p>
			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-medium">Template variables</h3>
				<p className="text-sm text-fg-muted">
					Trellis quotes each value as one shell argument. Use variables without extra quotes. Custom commands run in
					workDir. Use cd to select another checkout.
				</p>
				<div className="flex flex-wrap gap-2">
					{AGENT_LAUNCH_VARIABLES.map((variable) => (
						<code key={variable} className="border border-border bg-bg px-2 py-1 text-xs">{`{{${variable}}}`}</code>
					))}
				</div>
				<p className="text-sm text-fg-muted">
					prompt includes the persona and assignment. agentCommand starts the default agent with that prompt. projectId
					identifies the Superset project.
				</p>
			</div>
			<Button
				variant="quiet"
				align="start"
				disabled={!saved || value === DEFAULT_AGENT_LAUNCH_COMMAND}
				onClick={() => {
					setTemplate(DEFAULT_AGENT_LAUNCH_COMMAND);
					save.mutate(DEFAULT_AGENT_LAUNCH_COMMAND);
				}}
			>
				Use Superset default
			</Button>
			{invalid && (
				<p role="alert" className="text-sm text-danger">
					{!value.trim()
						? "Enter a command."
						: unknown.length > 0
							? `Unknown variables: ${unknown.join(", ")}`
							: "Remove the standalone hyphen. Superset reads it as an unknown option."}
				</p>
			)}
			{save.isError && (
				<p role="alert" className="text-sm text-danger">
					Could not save the command. {save.error.message}
					<Button variant="quiet" disabled={invalid} onClick={commit}>
						Retry
					</Button>
				</p>
			)}
			<div className="min-h-4">
				{save.isPending && (
					<p role="status" className="text-xs text-fg-muted">
						Save in progress…
					</p>
				)}
				{!save.isPending && <SavedMark savedAt={save.isSuccess && template === null ? save.submittedAt : null} />}
			</div>
		</SettingsRow>
	);
}
