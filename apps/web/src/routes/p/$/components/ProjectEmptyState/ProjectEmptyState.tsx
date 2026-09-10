import type { Project } from "@trellis/api";
import { Button, EmptyState, Input } from "@trellis/ui";
import { Inbox } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CliLine } from "../../../../../features/shell/CliLine";
import { projectSlashPath } from "../../../../../lib/projectPath";

export type ProjectEmptyStateProps = {
	project: Project;
	// Creates a ticket with the title and opens it.
	onCreate: (title: string) => Promise<void>;
};

// A project with no ticket. The fastest way to the first one is the CLI
// line; the button opens a one-field form.
export function ProjectEmptyState({ project, onCreate }: ProjectEmptyStateProps) {
	const [composing, setComposing] = useState(false);
	const [title, setTitle] = useState("");
	const [pending, setPending] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		await onCreate(title.trim());
	};

	return (
		<EmptyState
			icon={<Inbox />}
			title="No tickets yet"
			description={`${project.name} has no ticket. Create the first one here or from a terminal.`}
			className="flex-1 justify-center"
			action={
				<div className="flex flex-col items-center gap-3">
					{composing ? (
						<form onSubmit={submit} className="flex items-end gap-2">
							<Input
								label="Title"
								value={title}
								autoFocus
								autoComplete="off"
								placeholder="What needs to happen?"
								className="w-72"
								onChange={(event) => setTitle(event.target.value)}
							/>
							<Button type="submit" variant="primary" disabled={title.trim() === "" || pending}>
								Create
							</Button>
						</form>
					) : (
						<Button variant="primary" onClick={() => setComposing(true)}>
							Create ticket
						</Button>
					)}
					<CliLine command={`trellis new -p ${projectSlashPath(project.path)} "First ticket"`} />
				</div>
			}
		/>
	);
}
