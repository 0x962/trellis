import type { ReactNode } from "react";
import { Field } from "../../primitives/Field";
import type { ProjectColor } from "../projectColors";
import { ProjectColorPicker } from "./components/ProjectColorPicker";

export type ProjectColorFieldProps = {
	value: ProjectColor | null;
	// Colours held by other projects remain visible but unavailable.
	taken: readonly ProjectColor[];
	onValueChange: (value: ProjectColor | null) => void;
	label?: string;
	hint?: ReactNode;
	disabled?: boolean;
	// Fires when focus leaves both the trigger and the popover.
	onBlur?: () => void;
};

export function ProjectColorField({
	label = "Color",
	hint = "The color fills the project mark and its ticket key.",
	...props
}: ProjectColorFieldProps) {
	return (
		<Field label={label} hint={hint}>
			<ProjectColorPicker {...props} label={label} />
		</Field>
	);
}
