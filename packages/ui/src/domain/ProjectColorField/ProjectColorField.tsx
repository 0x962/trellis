import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check } from "@phosphor-icons/react";
import { Field } from "../../primitives/Field";
import { cx } from "../../utils/cx";
import { ProjectMark } from "../ProjectMark";
import { freeProjectColors, type ProjectColor, projectColorLabels, projectColors } from "../projectColors";

export type ProjectColorFieldProps = {
	value: ProjectColor | null;
	// The colors that the other projects hold. Those slots are gone.
	taken: readonly ProjectColor[];
	onValueChange: (value: ProjectColor | null) => void;
};

type Choice = ProjectColor | "none";

// Every cell keeps the same box in every state, so the grid stands still
// while the taken set changes. The box is 28 px under a mouse and 44 px under
// a finger, the two minimum hit areas of the design checklist.
const cellClass =
	"group relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-opacity duration-hover pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 data-checked:outline-2 data-checked:outline-offset-2 data-checked:outline-fg";

// The color a project holds. The 25 names are 25 slots: two projects never
// hold one name, so a name that another project holds is drawn faint and
// takes no click. The cells run in the order of `projectColors`, and every
// name keeps its cell in every state, so a name never moves under the pointer
// of the person who picks one. The last cell gives the project no color at
// all, and it stays reachable when every name is gone.
export function ProjectColorField({ value, taken, onValueChange }: ProjectColorFieldProps) {
	const free = freeProjectColors(taken, value);
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
			<RadioGroup
				aria-label="Color"
				value={value ?? "none"}
				onValueChange={(next) => onValueChange(next === "none" ? null : (next as ProjectColor))}
				className="grid w-fit grid-cols-5 gap-1"
			>
				{projectColors.map((color) => {
					const held = !free.includes(color);
					return (
						<Radio.Root
							key={color}
							value={color satisfies Choice}
							disabled={held}
							data-project-color={color}
							aria-label={held ? `${projectColorLabels[color]}, another project holds it` : projectColorLabels[color]}
							className={cx(cellClass, "project-swatch border-transparent", held ? "opacity-30" : "cursor-pointer")}
						>
							<Radio.Indicator className="inline-flex">
								<Check aria-hidden="true" weight="bold" className="size-4" />
							</Radio.Indicator>
						</Radio.Root>
					);
				})}
				<Radio.Root
					value={"none" satisfies Choice}
					aria-label="No color"
					className={cx(cellClass, "cursor-pointer border-border-strong bg-surface text-fg")}
				>
					<Radio.Indicator className="inline-flex">
						<Check aria-hidden="true" weight="bold" className="size-4" />
					</Radio.Indicator>
					<span className="inline-flex group-data-checked:hidden">
						<ProjectMark color={null} />
					</span>
				</Radio.Root>
			</RadioGroup>
		</Field>
	);
}
