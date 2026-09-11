import { useMutation } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { Button, Textarea } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsSection } from "../SettingsSection";

export function TicketTemplateSettings({ project }: { project: Project }) {
	const { client, queryClient } = useApp();
	const [template, setTemplate] = useState(project.ticketTemplate);
	const mutation = useMutation({
		mutationFn: () => client.projects.update({ project: project.path, ticketTemplate: template }),
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
						rows={14}
						value={template}
						onChange={(event) => setTemplate(event.target.value)}
					/>
					<p className="text-sm text-fg-muted">Use Markdown for headings, checklists, and instructions.</p>
				</div>
				<div className="project-settings-save">
					<Button type="submit" variant="primary" disabled={mutation.isPending}>
						Save template
					</Button>
					{mutation.isSuccess && (
						<p role="status" className="text-sm text-fg-muted">
							Template saved.
						</p>
					)}
				</div>
				{mutation.error && (
					<p role="alert" className="text-sm text-danger">
						{mutation.error.message}
					</p>
				)}
			</SettingsSection>
		</form>
	);
}
