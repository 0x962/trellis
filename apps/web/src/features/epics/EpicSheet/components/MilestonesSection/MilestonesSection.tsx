import { useMutation, useQuery } from "@tanstack/react-query";
import { MILESTONE_NAME_MAX, MilestoneNameSchema, type MilestoneSummary } from "@trellis/api";
import { Button, ConfirmDialog, Input, SectionHeader, Skeleton } from "@trellis/ui";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { errorMessage } from "../../../../../lib/conflict";
import { failToast } from "../../../../../lib/failToast";
import { formatCount } from "../../../../../lib/format";
import { MilestoneRow } from "./components/MilestoneRow";

export type MilestonesSectionProps = {
	// The ref of the epic the sheet edits, `OP/routine-runtime`.
	epicRef: string;
};

type Write =
	| { kind: "create"; name: string }
	| { kind: "rename"; milestone: MilestoneSummary; name: string }
	| { kind: "reorder"; refs: string[] }
	| { kind: "delete"; milestone: MilestoneSummary };

const failTitle = (write: Write) => {
	if (write.kind === "create") return `${write.name} is not added.`;
	if (write.kind === "rename") return `${write.milestone.name} is not renamed.`;
	if (write.kind === "reorder") return "The waves did not move.";
	return `${write.milestone.name} is not deleted.`;
};

// The Milestones section of the Edit epic sheet: the milestones of the epic
// in position order, and a field that adds one at the end. Every action
// here writes at once through the `milestones` procedures; the Save button
// of the sheet covers the name and the description of the epic only. The
// list comes from `epics.get`, and every write refetches the `epics`
// queries, so the epic page and the milestone groups of the table follow.
// The epics list opens the sheet before `epics.get` of the epic has run, so
// the section draws placeholder rows of the field height for that time, and
// the add field stays disabled until the list is on screen.
export function MilestonesSection({ epicRef }: MilestonesSectionProps) {
	const { client, orpc, queryClient } = useApp();
	const epic = useQuery(orpc.epics.get.queryOptions({ input: { epic: epicRef } }));
	const milestones = epic.data?.milestones ?? [];
	const [newName, setNewName] = useState("");
	const [deleting, setDeleting] = useState<MilestoneSummary | null>(null);
	const [moved, setMoved] = useState<{ id: string; step: -1 | 1 } | null>(null);
	const clearMoved = useCallback(() => setMoved(null), []);
	const parsedName = MilestoneNameSchema.safeParse(newName);
	const section = useRef<HTMLElement>(null);
	// The list index of the milestone whose delete the person confirmed, or
	// null. A delete removes the Delete button that opened the confirm
	// dialog, so the dialog cannot return the focus to it.
	const deletedIndex = useRef<number | null>(null);

	const write = useMutation({
		mutationFn: async (input: Write) => {
			if (input.kind === "create") await client.milestones.create({ epic: epicRef, name: input.name });
			else if (input.kind === "rename")
				await client.milestones.update({ milestone: input.milestone.ref, name: input.name });
			else if (input.kind === "reorder") await client.milestones.reorder({ epic: epicRef, milestones: input.refs });
			else await client.milestones.delete({ milestone: input.milestone.ref });
		},
		onSuccess: async (_, input) => {
			if (input.kind === "create") setNewName("");
			await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			// The confirm dialog closes after the list holds the new rows,
			// because `fieldAfterDelete` reads the rows when the dialog closes.
			if (input.kind === "delete") setDeleting(null);
			// A milestone delete takes the milestone off its tickets, and a
			// rename changes the name every ticket row prints.
			if (input.kind === "delete" || input.kind === "rename") {
				await queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
			}
		},
		onError: (error, input) => failToast(failTitle(input), error, () => write.mutate(input)),
	});

	const blocked = write.isPending || !epic.isSuccess;

	const move = (index: number, step: -1 | 1) => {
		setMoved({ id: milestones[index]!.id, step });
		const refs = milestones.map((milestone) => milestone.ref);
		const [moved] = refs.splice(index, 1);
		refs.splice(index + step, 0, moved!);
		write.mutate({ kind: "reorder", refs });
	};

	// The name fields of the rows come first in the section, in list order,
	// and the New milestone field comes last. After a delete the field at
	// the index of the deleted row is the name of the next row, or the New
	// milestone field when no row follows. A cancel returns true, so the
	// Delete button that opened the dialog takes the focus back.
	const fieldAfterDelete = () => {
		const index = deletedIndex.current;
		deletedIndex.current = null;
		return index === null ? true : section.current!.querySelectorAll("input")[index]!;
	};

	const add = () => {
		if (parsedName.success && !blocked) write.mutate({ kind: "create", name: parsedName.data });
	};

	return (
		<section ref={section} aria-label="Waves" className="flex flex-col gap-2">
			<SectionHeader title="Waves" count={epic.isSuccess ? formatCount(milestones.length) : undefined} level={3} />
			<p className="text-sm text-fg-muted">
				A wave is one phase of the epic. The epic page groups the tickets by wave in this order.
			</p>
			{epic.isPending && (
				<div aria-busy="true" className="flex flex-col gap-2">
					<Skeleton height="h-8 pointer-coarse:h-11" lines={3} />
				</div>
			)}
			{epic.isError && (
				<div role="alert" className="flex items-center justify-between gap-3 text-sm text-danger">
					<span className="min-w-0">{errorMessage(epic.error)}</span>
					<Button type="button" size="sm" onClick={() => void epic.refetch()}>
						Retry
					</Button>
				</div>
			)}
			{milestones.length > 0 && (
				<ul className="flex flex-col gap-2">
					{milestones.map((milestone, index) => (
						<MilestoneRow
							key={milestone.id}
							milestone={milestone}
							first={index === 0}
							last={index === milestones.length - 1}
							index={index}
							busy={write.isPending}
							focusStep={moved?.id === milestone.id ? moved.step : undefined}
							onFocusRestored={clearMoved}
							onRename={(name) => write.mutate({ kind: "rename", milestone, name })}
							onMove={(step) => move(index, step)}
							onDelete={() => setDeleting(milestone)}
						/>
					))}
				</ul>
			)}
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1">
					<Input
						label="New wave"
						autoComplete="off"
						maxLength={MILESTONE_NAME_MAX}
						disabled={!epic.isSuccess}
						readOnly={write.isPending}
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						onKeyDown={(event) => {
							// Enter adds the milestone. Without this, Enter submits the epic form around the field.
							if (event.key !== "Enter") return;
							event.preventDefault();
							add();
						}}
						placeholder="Phase 1"
						className="pointer-coarse:h-11"
					/>
				</div>
				<Button type="button" disabled={!parsedName.success || blocked} onClick={add}>
					Add wave
				</Button>
			</div>
			<ConfirmDialog
				open={deleting !== null}
				title={`Delete ${deleting?.name ?? "wave"}?`}
				description={
					deleting === null || deleting.counts.total === 0
						? "The wave holds no tickets. You cannot undo a delete."
						: `The ${formatCount(deleting.counts.total)} ${deleting.counts.total === 1 ? "ticket" : "tickets"} of the wave stay in the epic and leave the wave. You cannot undo a delete.`
				}
				confirmLabel="Delete wave"
				danger
				processing={write.isPending}
				finalFocus={fieldAfterDelete}
				onCancel={() => {
					deletedIndex.current = null;
					setDeleting(null);
				}}
				onConfirm={() => {
					deletedIndex.current = milestones.findIndex((milestone) => milestone.id === deleting!.id);
					write.mutate({ kind: "delete", milestone: deleting! });
				}}
			/>
		</section>
	);
}
