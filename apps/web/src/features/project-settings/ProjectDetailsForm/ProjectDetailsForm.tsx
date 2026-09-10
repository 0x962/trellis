import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { errors } from "@trellis/api";
import { Button, Input, Textarea } from "@trellis/ui";
import { type FormEvent, useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { SettingsSection } from "../SettingsSection";

export type ProjectDetailsFormProps = {
	project: Project;
};

export function ProjectDetailsForm({ project }: ProjectDetailsFormProps) {
	const { client, queryClient } = useApp();
	const navigate = useNavigate();
	const noticeId = useId();
	const [name, setName] = useState(project.name);
	const [slug, setSlug] = useState(project.slug);
	const [description, setDescription] = useState(project.description);
	const [ticketTemplate, setTicketTemplate] = useState(project.ticketTemplate);
	const [message, setMessage] = useState<string | null>(null);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		try {
			const stored = await client.projects.update({
				project: project.path,
				name: name.trim(),
				...(project.parentId === null ? {} : { slug }),
				description,
				ticketTemplate,
			});
			setMessage("Project saved.");
			await queryClient.invalidateQueries();
			if (stored.path !== project.path) {
				await navigate({
					to: "/p/$",
					params: { _splat: `${projectSlashPath(stored.path)}/settings` },
					replace: true,
				});
			}
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const locked = project.ticketCounter > 0;
	return (
		<form onSubmit={(event) => void save(event)}>
			<SettingsSection title="Project" hint="Set the name, path, description, and default ticket text.">
				<div className="grid gap-3 sm:grid-cols-2">
					<Input label="Project name" value={name} onChange={(event) => setName(event.target.value)} />
					<Input
						label="Slug"
						value={slug}
						readOnly={project.parentId === null}
						disabled={project.parentId === null}
						onChange={(event) => setSlug(event.target.value)}
					/>
				</div>
				<Input
					label="Key"
					value={project.key}
					readOnly
					aria-describedby={locked ? noticeId : undefined}
					className="max-w-28 font-mono uppercase"
				/>
				{locked && (
					<p id={noticeId} className="text-sm text-warning">
						{errors.KEY_LOCKED.message}
					</p>
				)}
				<Textarea
					label="Description"
					rows={3}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
				<Textarea
					label="Ticket template"
					rows={5}
					value={ticketTemplate}
					className="font-mono text-sm"
					onFocus={(event) => event.currentTarget.select()}
					onChange={(event) => setTicketTemplate(event.target.value)}
				/>
				<div className="flex items-center gap-3">
					<Button type="submit" variant="primary">
						Save project
					</Button>
					{message !== null && (
						<p role="status" className="text-sm text-fg-muted">
							{message}
						</p>
					)}
				</div>
			</SettingsSection>
		</form>
	);
}
