import { useMutation } from "@tanstack/react-query";
import { type AgentPromptSettings, promptTemplateError } from "@trellis/api";
import { Button, Field, FormStatus, Select } from "@trellis/ui";
import { type FormEvent, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { PromptTemplateEditor, type PromptTemplateEditorHandle } from "../PromptTemplateEditor";

export function AgentPromptForm({ saved }: { saved: AgentPromptSettings }) {
	const { client, queryClient, orpc } = useApp();
	const [snapshot, setSnapshot] = useState(saved);
	const [template, setTemplate] = useState(saved.template);
	const editor = useRef<PromptTemplateEditorHandle>(null);
	const error = promptTemplateError(template, snapshot.variables);
	const dirty = template !== snapshot.template;
	const mutation = useMutation({
		mutationFn: () =>
			client.settings.setAgentPrompt({
				template: template === snapshot.defaultTemplate ? null : template,
				expectedTemplate: snapshot.template,
			}),
		onSuccess: (next) => {
			setSnapshot(next);
			setTemplate(next.template);
			queryClient.setQueryData(orpc.settings.agentPrompt.queryKey({}), next);
		},
	});
	const change = (value: string) => {
		setTemplate(value);
		mutation.reset();
	};
	const save = (event: FormEvent) => {
		event.preventDefault();
		if (error || !dirty || mutation.isPending) return;
		mutation.mutate();
	};
	return (
		<form aria-label="Agent startup prompt" className="project-settings-group" onSubmit={save}>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-fg-muted">{snapshot.isCustom ? "Custom template" : "Default template"}</p>
				<Select
					label="Insert variable"
					placeholder="Insert variable"
					value=""
					items={snapshot.variables.map((name) => ({ value: name, label: `{{${name}}}` }))}
					disabled={mutation.isPending}
					onValueChange={(name) => editor.current?.insertVariable(name)}
				/>
			</div>
			<Field
				label="Prompt template"
				hint="Trellis replaces highlighted variables with the current project, ticket, and session context."
				error={error}
				disabled={mutation.isPending}
			>
				<PromptTemplateEditor ref={editor} value={template} variables={snapshot.variables} onChange={change} />
			</Field>
			<div className="project-settings-save">
				<Button
					type="button"
					disabled={mutation.isPending || template === snapshot.defaultTemplate}
					onClick={() => change(snapshot.defaultTemplate)}
				>
					Use default
				</Button>
				<Button type="button" disabled={mutation.isPending || !dirty} onClick={() => change(snapshot.template)}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					disabled={!dirty || error !== undefined}
					processing={mutation.isPending}
				>
					Save prompt
				</Button>
			</div>
			<FormStatus
				status={mutation.isPending ? "saving" : mutation.error ? "error" : mutation.isSuccess ? "saved" : "idle"}
				message={
					mutation.error?.message ??
					(mutation.isSuccess ? "Saved. The next harness start uses this prompt." : undefined)
				}
			/>
		</form>
	);
}
