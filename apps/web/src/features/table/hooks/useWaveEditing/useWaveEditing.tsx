import { useMutation } from "@tanstack/react-query";
import type { TicketSummary, WaveSummary } from "@trellis/api";
import { ConfirmDialog, type InlineEditFocus } from "@trellis/ui";
import { type ReactNode, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { failToast } from "../../../../lib/failToast";
import { nextWaveName } from "../../../pickers/utils/nextWaveName";
import { orderWaves } from "../../utils/waveGroups";
import { deleteWords, movedRefs } from "../../utils/waveRules";

export type WaveEditingOptions = {
	// The ref of the epic, `OP/routine-runtime`.
	epicRef: string;
	// The waves of the epic in position order, from `epics.get`.
	waves: readonly WaveSummary[];
	// Every ticket of the epic, from `epics.get`.
	tickets: readonly TicketSummary[];
	// The ids of the tickets with an open agent run.
	assignedTicketIds: ReadonlySet<string>;
};

export type WaveEditing = {
	epicRef: string;
	// The waves in the same order as their headers.
	waves: readonly WaveSummary[];
	// Adds `Wave <n>` at the end of the epic and opens its name field.
	create: () => void;
	busy: boolean;
	// The id of the wave whose header shows the name field, or null.
	renamingId: string | null;
	startRename: (waveId: string) => void;
	// Sends the new name. It throws when the server refuses, so the name
	// field stays open and prints the reason.
	rename: (wave: WaveSummary, name: string) => Promise<void>;
	// Closes the name field. `focus` is "value" when the person pressed Enter
	// or Escape, and the collapse button that holds the name takes the focus
	// back.
	endRename: (waveId: string, focus: InlineEditFocus) => void;
	// Moves a wave one place: -1 is up, 1 is down.
	move: (waveId: string, step: -1 | 1) => void;
	// True when a wave can move one place in the requested direction.
	canMove: (waveId: string, step: -1 | 1) => boolean;
	// Deletes a wave that holds no ticket at once, and asks first for a
	// wave that holds tickets.
	requestDelete: (waveId: string) => void;
	// The confirm dialog and the live region that says where a moved wave
	// went. The page renders it once.
	element: ReactNode;
};

type Write =
	| { kind: "create"; name: string }
	| { kind: "reorder"; wave: WaveSummary; refs: string[]; place: number; total: number }
	| { kind: "delete"; wave: WaveSummary };

const failTitle = (write: Write) => {
	if (write.kind === "create") return `${write.name} is not added.`;
	if (write.kind === "reorder") return `${write.wave.name} did not move.`;
	return `${write.wave.name} is not deleted.`;
};

// The collapse button of a wave header takes the focus back after a move.
// The header is a line of the virtual list, and a moved line loses the
// focus when React moves its DOM node.
const focusHeader = (waveId: string) =>
	document.querySelector<HTMLElement>(`[data-group="${waveId}"] button[aria-expanded]`)?.focus();

// The wave writes of the epic page. Every write refetches the `epics`
// queries, so the wave groups of the table follow.
//
// The rename stands apart from the mutation below. `InlineEdit` owns the name
// field, so a refused rename must reach the field as a rejected promise. The
// field then stays open with the typed name and prints the reason.
export function useWaveEditing({ epicRef, waves, tickets, assignedTicketIds }: WaveEditingOptions): WaveEditing {
	const { client, orpc, queryClient } = useApp();
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<WaveSummary | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const displayedWaves = orderWaves(waves);

	const write = useMutation({
		mutationFn: async (input: Write): Promise<WaveSummary | null> => {
			if (input.kind === "create") return client.waves.create({ epic: epicRef, name: input.name });
			if (input.kind === "reorder") await client.waves.reorder({ epic: epicRef, waves: input.refs });
			else await client.waves.delete({ wave: input.wave.ref });
			return null;
		},
		onSuccess: async (_, input) => {
			await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			if (input.kind === "delete") {
				// Every ticket row of the wave prints the wave name.
				await queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
				setDeleting(null);
			}
			if (input.kind === "reorder") {
				focusHeader(input.wave.id);
				setAnnouncement(`${input.wave.name} moved to place ${input.place} of ${input.total}.`);
			}
		},
		onError: (error, input) => failToast(failTitle(input), error, () => write.mutate(input)),
	});

	const byId = (waveId: string) => waves.find((wave) => wave.id === waveId)!;

	const create = () =>
		write.mutate({ kind: "create", name: nextWaveName(waves) }, { onSuccess: (wave) => setRenamingId(wave!.id) });

	const rename = async (wave: WaveSummary, name: string) => {
		await client.waves.update({ wave: wave.ref, name });
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
		// Every ticket row of the wave prints the wave name.
		await queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
	};

	const endRename = (waveId: string, focus: InlineEditFocus) => {
		setRenamingId(null);
		if (focus === "value") focusHeader(waveId);
	};

	const move = (waveId: string, step: -1 | 1) => {
		const refs = movedRefs(waves, waveId, step);
		if (refs !== null && !write.isPending) {
			write.mutate({
				kind: "reorder",
				wave: byId(waveId),
				refs,
				place: displayedWaves.findIndex((wave) => wave.id === waveId) + step + 1,
				total: displayedWaves.length,
			});
		}
	};
	const canMove = (waveId: string, step: -1 | 1) => movedRefs(waves, waveId, step) !== null;

	const requestDelete = (waveId: string) => {
		const wave = byId(waveId);
		if (wave.counts.total === 0) write.mutate({ kind: "delete", wave });
		else setDeleting(wave);
	};

	const element = (
		<>
			<ConfirmDialog
				open={deleting !== null}
				title={`Delete ${deleting?.name ?? "wave"}?`}
				description={deleting === null ? "" : deleteWords(deleting, tickets, assignedTicketIds)}
				confirmLabel="Delete wave"
				danger
				processing={write.isPending}
				onCancel={() => setDeleting(null)}
				onConfirm={() => write.mutate({ kind: "delete", wave: deleting! })}
			/>
			<div role="status" className="sr-only">
				{announcement}
			</div>
		</>
	);

	return {
		epicRef,
		waves: displayedWaves,
		create,
		busy: write.isPending,
		renamingId,
		startRename: setRenamingId,
		rename,
		endRename,
		move,
		canMove,
		requestDelete,
		element,
	};
}
