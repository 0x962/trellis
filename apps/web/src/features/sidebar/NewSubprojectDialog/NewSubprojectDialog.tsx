import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@trellis/api";
import { Button, Input, type ProjectColor, ProjectColorField, Sheet } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { takenColors } from "../../../lib/projectColors";
export type NewSubprojectDialogProps = {
	project: ProjectSummary;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};
export function NewSubprojectDialog({ project, open, onOpenChange }: NewSubprojectDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [color, setColor] = useState<ProjectColor | null>(null);
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const create = useMutation({
		mutationFn: () =>
			client.projects.create({
				parent: project.path,
				name: name.trim(),
				slug,
				...(color === null ? {} : { color }),
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries();
			setName("");
			setSlug("");
			setColor(null);
			onOpenChange(false);
		},
	});
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => !create.isPending && onOpenChange(next)}
			title={`New sub-project under ${project.name}`}
			titleClassName="text-md font-medium"
			initialFocus={nameRef}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim() && slug && !create.isPending) create.mutate();
				}}
			>
				<div className="flex flex-1 flex-col gap-6 p-6 max-md:p-4">
					<p className="text-sm text-fg-muted">Create a sub-project. It shares the key of the root project.</p>
					<Input
						ref={nameRef}
						label="Project name"
						required
						maxLength={120}
						disabled={create.isPending}
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<Input
						label="Slug"
						required
						disabled={create.isPending}
						value={slug}
						onChange={(event) => setSlug(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<ProjectColorField
						value={color}
						taken={takenColors(projects)}
						onValueChange={setColor}
						disabled={create.isPending}
					/>
					{create.isError && (
						<p role="alert" className="text-sm text-danger">
							{create.error.message}
						</p>
					)}
				</div>
				<div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface p-4">
					<Button type="button" variant="quiet" disabled={create.isPending} onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!name.trim() || !slug || create.isPending}>
						Create sub-project
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
