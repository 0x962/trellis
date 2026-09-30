import { Stack } from "@phosphor-icons/react";
import { ComposerProperty, Field, Popover } from "@trellis/ui";
import { EpicPicker } from "../../../../pickers/EpicPicker";
import { WavePicker } from "../../../../pickers/WavePicker";
import type { useCreatePlacement } from "../../../hooks/useCreatePlacement";

export function PlacementPicker({
	project,
	placement,
	onEpic,
	onWave,
	disabled,
}: {
	project?: string;
	placement: ReturnType<typeof useCreatePlacement>;
	onEpic: (ref: string | null) => void;
	onWave: (ref: string | null) => void;
	disabled: boolean;
}) {
	return (
		<Popover
			label="Epic and wave"
			className="w-64 p-3"
			trigger={
				<ComposerProperty
					icon={<Stack />}
					aria-label={`Epic and wave: ${placement.epicName}, ${placement.waveName}`}
					disabled={disabled || !project}
					aria-invalid={!placement.ready || undefined}
				>
					{placement.ready ? placement.waveName : placement.epic ? "Choose a wave" : "Choose an epic"}
				</ComposerProperty>
			}
		>
			<div className="flex flex-col gap-3">
				<Field label="Epic">
					{placement.newEpic ? (
						<span className="text-sm">Default (new)</span>
					) : (
						<EpicPicker
							project={project!}
							value={placement.epic}
							allowNone={false}
							onPick={(next) => onEpic(next?.ref ?? null)}
							trigger={<ComposerProperty>{placement.epicName}</ComposerProperty>}
						/>
					)}
				</Field>
				<Field label="Wave">
					{placement.newWave || !placement.epic ? (
						<span className="text-sm">{placement.waveName}</span>
					) : (
						<WavePicker
							epic={placement.epic}
							value={placement.wave}
							allowNone={false}
							onPick={(next) => onWave(next?.ref ?? null)}
							trigger={<ComposerProperty>{placement.waveName}</ComposerProperty>}
						/>
					)}
				</Field>
				{placement.message && (
					<p role="status" className="text-xs text-fg-muted">
						{placement.message}
					</p>
				)}
			</div>
		</Popover>
	);
}
