import type { ProjectSummary } from "@trellis/api";
import { Button, Dialog, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type NewSubprojectDialogProps = {
	project: ProjectSummary;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function NewSubprojectDialog({ project, open, onOpenChange }: NewSubprojectDialogProps) {
	const { client, queryClient } = useApp();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [message, setMessage] = useState<string | null>(null);

	const create = async (event: FormEvent) => {
		event.preventDefault();
		try {
			await client.projects.create({ parent: project.path, name: name.trim(), slug });
			await queryClient.invalidateQueries();
			setName("");
			setSlug("");
			setMessage(null);
			onOpenChange(false);
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={`New sub-project under ${project.name}`}
			description="Create a nested project that shares this root key."
		>
			<form className="flex flex-col gap-3" onSubmit={(event) => void create(event)}>
				<Input label="Project name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
				<Input label="Slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
				{message !== null && (
					<p role="alert" className="text-sm text-danger">
						{message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" variant="primary">
						Create sub-project
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
