import { useMutation } from "@tanstack/react-query";
import type { TicketSummary, WaveSummary } from "@trellis/api";
import { ConfirmDialog } from "@trellis/ui";
import { type ReactNode, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { failToast } from "../../../../lib/failToast";
import { nextWaveName } from "../../../pickers/utils/nextWaveName";
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
	waves: readonly WaveSummary[];
	// Adds `Wave <n>` at the end of the epic and opens its name field.
	create: () => void;
	busy: boolean;
	// The id of the wave whose header shows the name field, or null.
	renamingId: string | null;
	startRename: (waveId: string) => void;
	// Closes the name field. A name that is not empty and differs from the
	// stored name is saved.
	finishRename: (wave: WaveSummary, name: string) => void;
	// Moves a wave one place: -1 is up, 1 is down.
	move: (waveId: string, step: -1 | 1) => void;
	// Deletes a wave that holds no ticket at once, and asks first for a
	// wave that holds tickets.
	requestDelete: (waveId: string) => void;
	// The confirm dialog and the live region that says where a moved wave
	// went. The page renders it once.
	element: ReactNode;
};

type Write =
	| { kind: "create"; name: string }
	| { kind: "rename"; wave: WaveSummary; name: string }
	| { kind: "reorder"; wave: WaveSummary; refs: string[] }
	| { kind: "delete"; wave: WaveSummary };

const failTitle = (write: Write) => {
	if (write.kind === "create") return `${write.name} is not added.`;
	if (write.kind === "rename") return `${write.wave.name} is not renamed.`;
	if (write.kind === "reorder") return `${write.wave.name} did not move.`;
	return `${write.wave.name} is not deleted.`;
};

// The collapse button of a wave header takes the focus back after a move.
// The header is a line of the virtual list, and a moved line loses the
// focus when React moves its DOM node.
const focusHeader = (waveId: string) =>
	document.querySelector<HTMLElement>(`[data-group="${waveId}"] button[aria-expanded]`)?.focus();

// The wave writes of the epic page. Every write refetches the `epics`
// queries, so the wave groups of the table follow. A delete and a rename
// also refetch the tickets, because every ticket row of the wave prints
// the wave name.
export function useWaveEditing({ epicRef, waves, tickets, assignedTicketIds }: WaveEditingOptions): WaveEditing {
	const { client, orpc, queryClient } = useApp();
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<WaveSummary | null>(null);
	const [announcement, setAnnouncement] = useState("");

	const write = useMutation({
		mutationFn: async (input: Write): Promise<WaveSummary | null> => {
			if (input.kind === "create") return client.waves.create({ epic: epicRef, name: input.name });
			if (input.kind === "rename") return client.waves.update({ wave: input.wave.ref, name: input.name });
			if (input.kind === "reorder") await client.waves.reorder({ epic: epicRef, waves: input.refs });
			else await client.waves.delete({ wave: input.wave.ref });
			return null;
		},
		onSuccess: async (_, input) => {
			await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			if (input.kind === "delete" || input.kind === "rename") {
				await queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
			}
			if (input.kind === "delete") setDeleting(null);
			if (input.kind === "reorder") {
				focusHeader(input.wave.id);
				setAnnouncement(
					`${input.wave.name} moved to place ${input.refs.indexOf(input.wave.ref) + 1} of ${input.refs.length}.`,
				);
			}
		},
		onError: (error, input) => failToast(failTitle(input), error, () => write.mutate(input)),
	});

	const byId = (waveId: string) => waves.find((wave) => wave.id === waveId)!;

	const create = () =>
		write.mutate({ kind: "create", name: nextWaveName(waves) }, { onSuccess: (wave) => setRenamingId(wave!.id) });

	const finishRename = (wave: WaveSummary, name: string) => {
		setRenamingId(null);
		const next = name.trim();
		if (next !== "" && next !== wave.name) write.mutate({ kind: "rename", wave, name: next });
	};

	const move = (waveId: string, step: -1 | 1) => {
		const refs = movedRefs(waves, waveId, step);
		if (refs !== null && !write.isPending) write.mutate({ kind: "reorder", wave: byId(waveId), refs });
	};

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
		waves,
		create,
		busy: write.isPending,
		renamingId,
		startRename: setRenamingId,
		finishRename,
		move,
		requestDelete,
		element,
	};
}
