import { Lock } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { Button, Input, type ProjectColor, ProjectColorField, Textarea } from "@trellis/ui";
import { type FormEvent, useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { takenColors } from "../../../lib/projectColors";

export type ProjectDetailsFormProps = {
	project: Project;
};

// After the first ticket, the key is part of every ticket ID, so the server
// refuses a change of the key.
const keyLockedHint = (key: string) =>
	`Ticket IDs start with ${key}. The key cannot change after the project has a ticket.`;

export function ProjectDetailsForm({ project }: ProjectDetailsFormProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const noticeId = useId();
	const headingId = useId();
	const [name, setName] = useState(project.name);
	const [key, setKey] = useState(project.key);
	const [description, setDescription] = useState(project.description);
	const [color, setColor] = useState<ProjectColor | null>(project.color);
	const [message, setMessage] = useState<string | null>(null);
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const locked = project.ticketCounter > 0;

	const save = async (event: FormEvent) => {
		event.preventDefault();
		try {
			const stored = await client.projects.update({
				project: project.key,
				name: name.trim(),
				...(locked ? {} : { key: key.trim().toUpperCase() }),
				description,
				color,
			});
			setMessage("Project saved.");
			await queryClient.invalidateQueries();
			if (stored.key !== project.key) {
				await navigate({ to: "/p/$", params: { _splat: `${stored.key}/settings` }, replace: true });
			}
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	return (
		<form onSubmit={(event) => void save(event)} aria-labelledby={headingId} className="project-settings-group">
			<h3 id={headingId} className="project-settings-group-title">
				Project details
			</h3>
			<Input label="Project name" value={name} onChange={(event) => setName(event.target.value)} />
			<Input
				label="Key"
				value={key}
				readOnly={locked}
				disabled={locked}
				aria-describedby={locked ? noticeId : undefined}
				className="max-w-28 uppercase"
				onChange={(event) => setKey(event.target.value)}
			/>
			{locked && (
				<p id={noticeId} className="flex items-center gap-1.5 text-sm text-fg-muted">
					<Lock aria-hidden="true" className="size-3 shrink-0" />
					{keyLockedHint(project.key)}
				</p>
			)}
			<ProjectColorField value={color} taken={takenColors(projects, project.id)} onValueChange={setColor} />
			<Textarea
				label="Description"
				rows={3}
				value={description}
				onChange={(event) => setDescription(event.target.value)}
			/>
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
		</form>
	);
}
