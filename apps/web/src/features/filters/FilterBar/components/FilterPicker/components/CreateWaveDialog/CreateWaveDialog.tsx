import { useQuery } from "@tanstack/react-query";
import { WaveNameSchema, type WaveSummary } from "@trellis/api";
import { Button, ComposerProperty, Dialog, FailureState, Field, Input } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { EpicPicker } from "../../../../../../pickers/EpicPicker";
import { usePickerCreate } from "../../../../../../pickers/hooks/usePickerCreate";

export function CreateWaveDialog({
	project,
	initialName,
	onCreated,
	onClose,
}: {
	project: string;
	initialName: string;
	onCreated: (wave: WaveSummary) => void;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [name, setName] = useState(initialName);
	const [epic, setEpic] = useState<{ ref: string; name: string } | null>(null);
	const detail = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: epic?.ref ?? "" } }),
		enabled: epic !== null,
		retry: false,
	});
	const existing = detail.data?.waves.find((wave) => wave.name.toLowerCase() === name.trim().toLowerCase());
	const creation = usePickerCreate({
		scope: epic?.ref,
		create: (name) => client.waves.create({ epic: epic!.ref, name }),
		invalidate: () => queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
		onCreated,
	});
	return (
		<Dialog
			open
			title="Create wave"
			onOpenChange={(open) => {
				if (!open && !creation.pending) onClose();
			}}
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (!detail.isSuccess || !WaveNameSchema.safeParse(name.trim()).success || creation.pending) return;
					if (existing) onCreated(existing);
					else creation.create(name.trim());
				}}
			>
				<Field label="Epic">
					<EpicPicker
						project={project}
						allowNone={false}
						value={epic?.ref}
						onPick={setEpic}
						trigger={<ComposerProperty disabled={creation.pending}>{epic?.name ?? "Choose epic"}</ComposerProperty>}
					/>
				</Field>
				<Input
					label="Wave name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					disabled={creation.pending}
					autoFocus
					error={creation.error ?? undefined}
				/>
				{detail.isError && (
					<FailureState
						title="Waves could not load."
						detail={detail.error.message}
						action={
							<Button type="button" processing={detail.isFetching} onClick={() => void detail.refetch()}>
								Retry
							</Button>
						}
					/>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" disabled={creation.pending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						processing={creation.pending}
						disabled={!detail.isSuccess || !WaveNameSchema.safeParse(name.trim()).success}
					>
						{existing ? "Use wave" : "Create wave"}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
