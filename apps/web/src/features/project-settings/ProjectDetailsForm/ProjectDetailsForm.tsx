import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import {
	Button,
	FormStatus,
	type FormStatusProps,
	Input,
	type ProjectColor,
	ProjectColorField,
	Textarea,
} from "@trellis/ui";
import { type FormEvent, useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { takenColors } from "../../../lib/projectColors";

export type ProjectDetailsFormProps = {
	project: Project;
};

export function ProjectDetailsForm({ project }: ProjectDetailsFormProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const headingId = useId();
	const [name, setName] = useState(project.name);
	const [key, setKey] = useState(project.key);
	const [description, setDescription] = useState(project.description);
	const [color, setColor] = useState<ProjectColor | null>(project.color);
	const [message, setMessage] = useState<string | undefined>();
	const [saveStatus, setSaveStatus] = useState<FormStatusProps["status"]>("idle");
	// The project list refetches after every ticket move. `select` cuts the
	// result down to the color names, so the form redraws only when a color
	// changes.
	const taken = useSuspenseQuery({
		...orpc.projects.list.queryOptions({ input: {} }),
		select: (projects) => takenColors(projects, project.id),
	}).data;
	const locked = project.ticketCounter > 0;

	const save = async (event: FormEvent) => {
		event.preventDefault();
		setMessage(undefined);
		setSaveStatus("saving");
		try {
			const stored = await client.projects.update({
				project: project.key,
				name: name.trim(),
				...(locked ? {} : { key: key.trim().toUpperCase() }),
				description,
				color,
			});
			setSaveStatus("saved");
			await queryClient.invalidateQueries();
			if (stored.key !== project.key) {
				await navigate({ to: "/p/$", params: { _splat: `${stored.key}/settings` }, replace: true });
			}
		} catch (error) {
			setMessage((error as Error).message);
			setSaveStatus("error");
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
				readOnlyReason={`Every ticket ID starts with ${project.key}.`}
				className="max-w-28 uppercase"
				onChange={(event) => setKey(event.target.value)}
			/>
			<ProjectColorField value={color} taken={taken} onValueChange={setColor} />
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
				<FormStatus status={saveStatus} message={message} />
			</div>
		</form>
	);
}
