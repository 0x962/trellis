import { Field } from "../../primitives/Field";
import { Select, type SelectItem } from "../../primitives/Select";
import { ProjectMark } from "../ProjectMark";
import { freeProjectColors, type ProjectColor, projectColorNames } from "../projectColors";

export type ProjectColorFieldProps = {
	// The color this project holds, or `null` for a project with none.
	value: ProjectColor | null;
	// The colors that the other projects hold. Those slots are gone.
	taken: readonly ProjectColor[];
	onValueChange: (value: ProjectColor | null) => void;
	disabled?: boolean;
};

// "none" is the value of the item that gives the project no color.
type Choice = ProjectColor | "none";

const noneItem: SelectItem<Choice> = { value: "none", label: "No color", icon: <ProjectMark color={null} /> };

// The color field of a project. The list holds the free colors and the color
// of this project. A color that another project holds is not in the list,
// because two projects never hold one color.
//
// Five colors are five slots. A sixth project reads the sentence below the
// field, and it keeps the grey mark and the plain page ground.
export function ProjectColorField({ value, taken, onValueChange, disabled = false }: ProjectColorFieldProps) {
	const free = freeProjectColors(taken, value);
	const items: SelectItem<Choice>[] = [
		noneItem,
		...free.map((color) => ({
			value: color,
			label: projectColorNames[color],
			icon: <ProjectMark color={color} />,
		})),
	];
	return (
		<Field
			label="Color"
			hint={
				free.length === 0
					? "Every color belongs to another project. Take one back there to give this project a color."
					: "The color tints the mark of the project and the ground of every page of the project."
			}
			className="max-w-64"
		>
			<Select
				label="Color"
				items={items}
				value={value ?? "none"}
				disabled={disabled || free.length === 0}
				onValueChange={(next) => onValueChange(next === "none" ? null : next)}
				className="w-full"
			/>
		</Field>
	);
}
