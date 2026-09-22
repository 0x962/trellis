import { useMutation } from "@tanstack/react-query";
import {
	EPIC_DESCRIPTION_MAX,
	EPIC_NAME_MAX,
	type Epic,
	type EpicCreateInput,
	EpicCreateInputSchema,
	type EpicSummary,
	type Project,
} from "@trellis/api";
import { Button, Input, Sheet, SheetBody, SheetFooter, Textarea } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type EpicSheetProps = {
	project: Project;
	// The epic to edit. Without one the sheet creates an epic.
	epic?: EpicSummary;
	onClose: () => void;
	// Receives the saved record before the sheet closes.
	onSaved?: (epic: Epic) => void;
};

// The form of an epic: the name and the plan as markdown. A create and an
// edit share it. The server derives the slug from the name. The waves of
// the epic are edited on the Overview of the epic page.
export function EpicSheet({ project, epic, onClose, onSaved }: EpicSheetProps) {
	const { client, orpc, queryClient } = useApp();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(epic?.name ?? "");
	const [description, setDescription] = useState(epic?.description ?? "");
	const input = EpicCreateInputSchema.safeParse({ project: project.path, name, description });
	const save = useMutation({
		mutationFn: (fields: EpicCreateInput) =>
			epic === undefined
				? client.epics.create(fields)
				: client.epics.update({ epic: epic.ref, name: fields.name, description: fields.description }),
		onSuccess: async (saved) => {
			// The project row prints the count of open epics, so it refetches
			// with the epics.
			await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
			onSaved?.(saved);
			onClose();
		},
	});
	const pending = save.isPending;
	const dirty = epic !== undefined && (name !== epic.name || description !== epic.description);

	return (
		<Sheet
			open
			title={epic === undefined ? "New epic" : "Edit epic"}
			initialFocus={nameRef}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !pending && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (input.success && !pending) save.mutate(input.data);
				}}
			>
				<SheetBody>
					<p className="text-sm text-fg-muted">
						An epic groups the tickets of one plan in {project.path}. Every agent of a ticket in the epic reads the
						description through its brief.
					</p>
					<Input
						ref={nameRef}
						label="Name"
						required
						autoComplete="off"
						maxLength={EPIC_NAME_MAX}
						disabled={pending}
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<Textarea
						label="Description"
						rows={16}
						maxLength={EPIC_DESCRIPTION_MAX}
						disabled={pending}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="The plan, in markdown. A bare ticket identifier such as OP-29 links to its ticket."
					/>
					{save.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not save the epic. {save.error.message}
						</p>
					)}
				</SheetBody>
				<SheetFooter>
					<Button type="button" variant="quiet" disabled={pending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!input.success || pending || (epic !== undefined && !dirty)}
						aria-busy={pending}
					>
						{epic === undefined ? "Create epic" : "Save changes"}
					</Button>
				</SheetFooter>
			</form>
		</Sheet>
	);
}
