import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { Button, Input, Textarea } from "@trellis/ui";
import { Lock } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { SettingsSection } from "../SettingsSection";

export type ProjectDetailsFormProps = {
	project: Project;
};

// After the first ticket, the key is part of every ticket ID, so the server
// refuses a change of the key.
const keyLockedHint = (key: string) =>
	`Ticket IDs start with ${key}. The key cannot change after the project has a ticket.`;

export function ProjectDetailsForm({ project }: ProjectDetailsFormProps) {
	const { client, queryClient } = useApp();
	const navigate = useNavigate();
	const noticeId = useId();
	const [name, setName] = useState(project.name);
	const [slug, setSlug] = useState(project.slug);
	const [description, setDescription] = useState(project.description);
	const [message, setMessage] = useState<string | null>(null);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		try {
			const stored = await client.projects.update({
				project: project.path,
				name: name.trim(),
				...(project.parentId === null ? {} : { slug }),
				description,
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
			<SettingsSection title="General" hint="Name this project and describe the work it contains.">
				<div className="project-settings-group">
					<h3 className="project-settings-group-title">Project identity</h3>
					<div className="grid gap-4 sm:grid-cols-2">
						<Input label="Project name" value={name} onChange={(event) => setName(event.target.value)} />
						<Input
							label="Slug"
							value={slug}
							readOnly={project.parentId === null}
							disabled={project.parentId === null}
							onChange={(event) => setSlug(event.target.value)}
						/>
					</div>
					{/* TRL-37. The key is read-only on every project, so it takes the
					    treatment the read-only slug takes: disabled, at half opacity.
					    Read-only alone drew the field exactly like the editable Project
					    name field beside it, so a person clicked in and typed nothing. */}
					<Input
						label="Key"
						value={project.key}
						readOnly
						disabled
						aria-describedby={locked ? noticeId : undefined}
						className="max-w-28 font-mono uppercase"
					/>
					{locked && (
						<p id={noticeId} className="flex items-center gap-1.5 text-sm text-fg-muted">
							<Lock aria-hidden="true" className="size-3 shrink-0" />
							{keyLockedHint(project.key)}
						</p>
					)}
				</div>
				<div className="project-settings-group">
					<h3 className="project-settings-group-title">About this project</h3>
					<Textarea
						label="Description"
						rows={3}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
				</div>
				<div className="project-settings-save">
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
