import { useMutation } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { Button, FormStatus, Textarea } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsSection } from "../SettingsSection";

export function TicketTemplateSettings({ project }: { project: Project }) {
	const { client, queryClient } = useApp();
	const [template, setTemplate] = useState(project.ticketTemplate);
	const mutation = useMutation({
		mutationFn: () => client.projects.update({ project: project.key, ticketTemplate: template }),
		onSuccess: () => queryClient.invalidateQueries(),
	});
	const save = (event: FormEvent) => {
		event.preventDefault();
		mutation.mutate();
	};
	return (
		<form onSubmit={save}>
			<SettingsSection title="Ticket template" hint="Set the starting description for new tickets in this project.">
				<div className="project-settings-group">
					<Textarea
						label="Ticket template"
						hint="Use Markdown for headings, checklists, and instructions."
						rows={14}
						value={template}
						onChange={(event) => setTemplate(event.target.value)}
					/>
				</div>
				<div className="project-settings-save">
					<Button type="submit" variant="primary" disabled={mutation.isPending}>
						Save template
					</Button>
					<FormStatus
						status={mutation.isPending ? "saving" : mutation.error ? "error" : mutation.isSuccess ? "saved" : "idle"}
						message={mutation.error?.message}
					/>
				</div>
			</SettingsSection>
		</form>
	);
}
