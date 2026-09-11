import { useMutation } from "@tanstack/react-query";
import { AGENT_LAUNCH_VARIABLES, DEFAULT_AGENT_LAUNCH_COMMAND, unknownLaunchVariables } from "@trellis/api";
import { Button, Sheet, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SettingsRow } from "../SettingsRow";
export function AgentLaunchField() {
	const { saved } = useSettingsDraft();
	const { client, orpc, queryClient } = useApp();
	const [template, setTemplate] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: () => client.settings.set({ ...saved!, agentLaunchCommand: template! }),
		onSuccess: (settings) => {
			queryClient.setQueryData(orpc.settings.get.queryKey({}), settings);
			setTemplate(null);
		},
	});
	const unknown = unknownLaunchVariables(template ?? "");
	return (
		<SettingsRow
			label="Agent launch"
			hint="Choose the command Trellis uses to open an agent. The default uses Superset."
		>
			<Button
				variant="quiet"
				disabled={!saved}
				onClick={() => {
					save.reset();
					setTemplate(saved?.agentLaunchCommand ?? DEFAULT_AGENT_LAUNCH_COMMAND);
				}}
			>
				Configure agent launch
			</Button>
			{template !== null && (
				<Sheet
					open
					title="Agent launch command"
					titleClassName="text-md font-medium"
					onOpenChange={(open) => !open && !save.isPending && setTemplate(null)}
				>
					<form
						className="flex min-h-full flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							if (template.trim() && unknown.length === 0 && !save.isPending) save.mutate();
						}}
					>
						<div className="flex flex-1 flex-col gap-6 p-6 max-md:p-4">
							<p className="text-sm text-fg-muted">
								Superset opens a tracked terminal. Custom commands run in a persistent terminal with status, output, and
								follow-ups.
							</p>
							<Textarea
								label="Command template"
								rows={8}
								required
								maxLength={20000}
								spellCheck={false}
								value={template}
								disabled={save.isPending}
								onChange={(event) => setTemplate(event.target.value)}
								className="font-mono text-sm"
							/>
							<div className="flex flex-col gap-2">
								<h2 className="text-sm font-medium">Template variables</h2>
								<p className="text-sm text-fg-muted">
									Trellis quotes each value as one shell argument. Use variables without extra quotes. Custom commands
									run in workDir. Use cd to select another checkout.
								</p>
								<div className="flex flex-wrap gap-2">
									{AGENT_LAUNCH_VARIABLES.map((variable) => (
										<code
											key={variable}
											className="border border-border bg-bg px-2 py-1 text-xs"
										>{`{{${variable}}}`}</code>
									))}
								</div>
								<p className="text-sm text-fg-muted">
									prompt includes the persona and assignment. agentCommand starts the default agent with that prompt.
									projectId identifies the Superset project.
								</p>
							</div>
							<Button type="button" variant="quiet" onClick={() => setTemplate(DEFAULT_AGENT_LAUNCH_COMMAND)}>
								Use Superset default
							</Button>
							{unknown.length > 0 && (
								<p role="alert" className="text-sm text-danger">
									Unknown variables: {unknown.join(", ")}
								</p>
							)}
							{save.isError && (
								<p role="alert" className="text-sm text-danger">
									Could not save the command. {save.error.message}
								</p>
							)}
						</div>
						<div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface p-4">
							<Button type="button" variant="quiet" disabled={save.isPending} onClick={() => setTemplate(null)}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={!template.trim() || unknown.length > 0 || save.isPending}
							>
								Save command
							</Button>
						</div>
					</form>
				</Sheet>
			)}
		</SettingsRow>
	);
}
