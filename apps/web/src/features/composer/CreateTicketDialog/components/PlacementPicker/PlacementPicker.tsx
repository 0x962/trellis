import { Stack } from "@phosphor-icons/react";
import { Button, ComposerProperty, FailureState, Field, Popover } from "@trellis/ui";
import { useRef } from "react";
import { EpicPicker } from "../../../../pickers/EpicPicker";
import { WavePicker } from "../../../../pickers/WavePicker";
import type { useCreatePlacement } from "../../../hooks/useCreatePlacement";

export function PlacementPicker({
	project,
	placement,
	glimmer,
	onEpic,
	onWave,
	disabled,
}: {
	project?: string;
	placement: ReturnType<typeof useCreatePlacement>;
	glimmer?: boolean;
	onEpic: (ref: string | null) => void;
	onWave: (ref: string | null) => void;
	disabled: boolean;
}) {
	const epicTrigger = useRef<HTMLButtonElement>(null);
	return (
		<Popover
			label="Epic and wave"
			className="w-64 max-w-(--available-width) max-h-(--available-height) overflow-y-auto p-3"
			trigger={
				<ComposerProperty
					icon={<Stack />}
					glimmer={glimmer}
					glimmerValue={placement.wave}
					aria-label={`Epic and wave: ${placement.epicName}, ${placement.waveName}`}
					disabled={disabled || !project}
					aria-invalid={!placement.ready || undefined}
				>
					{placement.ready ? placement.waveName : placement.epic ? "Choose a wave" : "Choose epic and wave"}
				</ComposerProperty>
			}
		>
			<div className="flex flex-col gap-3">
				<Field label="Epic">
					<EpicPicker
						project={project!}
						value={placement.epic}
						allowNone={false}
						onPick={(next) => onEpic(next?.ref ?? null)}
						trigger={<ComposerProperty ref={epicTrigger}>{placement.epicName}</ComposerProperty>}
					/>
				</Field>
				<Field label="Wave">
					{!placement.epic ? (
						<span className="text-sm">{placement.waveName}</span>
					) : (
						<WavePicker
							epic={placement.epic}
							value={placement.wave}
							allowNone={false}
							onPick={(next) => onWave(next?.ref ?? null)}
							trigger={
								<ComposerProperty glimmer={glimmer} glimmerValue={placement.wave}>
									{placement.waveName}
								</ComposerProperty>
							}
						/>
					)}
				</Field>
				{placement.error ? (
					<FailureState
						variant="section"
						className="p-0"
						title="The epic or wave could not load."
						detail={placement.error.message}
						action={
							<Button
								size="md"
								processing={placement.fetching}
								onClick={async () => {
									await placement.retry();
									epicTrigger.current?.focus({ preventScroll: true });
								}}
							>
								Retry
							</Button>
						}
					/>
				) : (
					placement.message && (
						<p role="status" className="text-xs text-fg-muted">
							{placement.message}
						</p>
					)
				)}
			</div>
		</Popover>
	);
}
