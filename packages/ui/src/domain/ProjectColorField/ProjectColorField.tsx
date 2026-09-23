import { Field } from "../../primitives/Field";
import { Select, type SelectItem } from "../../primitives/Select";
import { ProjectMark } from "../ProjectMark";
import { freeProjectColors, type ProjectColor, projectColorLabels } from "../projectColors";

export type ProjectColorFieldProps = {
	value: ProjectColor | null;
	// The colors that the other projects hold. Those slots are gone.
	taken: readonly ProjectColor[];
	onValueChange: (value: ProjectColor | null) => void;
};

type Choice = ProjectColor | "none";

const noneItem: SelectItem<Choice> = { value: "none", label: "No color", icon: <ProjectMark color={null} /> };

// The color field of a project. A project that finds no free color reads the
// sentence under the field, and it keeps the grey mark and the grey key
// chip.
export function ProjectColorField({ value, taken, onValueChange }: ProjectColorFieldProps) {
	const free = freeProjectColors(taken, value);
	const items: SelectItem<Choice>[] = [
		noneItem,
		...free.map((color) => ({
			value: color,
			label: projectColorLabels[color],
			icon: <ProjectMark color={color} />,
		})),
	];
	return (
		<Field
			label="Color"
			hint={
				free.length === 0
					? "Every color belongs to another project. Take one back there to give this project a color."
					: "The color fills the mark of the project and the chip that carries its key."
			}
			className="max-w-64"
		>
			<Select
				label="Color"
				items={items}
				value={value ?? "none"}
				disabled={free.length === 0}
				onValueChange={(next) => onValueChange(next === "none" ? null : next)}
				className="w-full"
			/>
		</Field>
	);
}
