import type { WaveSummary } from "@trellis/api";
import { InlineEdit } from "@trellis/ui";
import type { WaveEditing } from "../../../hooks/useWaveEditing";

export type WaveNameProps = {
	wave: WaveSummary;
	editing: WaveEditing;
};

// The name of a wave while the person renames it. `GroupHeader` draws the
// name at rest inside its collapse button and puts this field in its place,
// so `InlineEdit` here holds the field alone and never the value at rest.
// The header takes the focus back after Enter and after Escape.
export function WaveName({ wave, editing }: WaveNameProps) {
	return (
		<InlineEdit
			label="Wave name"
			value={wave.name}
			editing
			onEditingChange={(_, focus) => editing.endRename(wave.id, focus)}
			onSave={(name) => editing.rename(wave, name)}
			errorTitle={`${wave.name} is not renamed.`}
			className="w-60 max-md:flex-1"
			inputClassName="h-7 pointer-coarse:h-11"
		/>
	);
}
