import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check } from "@phosphor-icons/react";
import { cx } from "../../../../utils/cx";
import { ProjectMark } from "../../../ProjectMark";
import { freeProjectColors, projectColorLabels, projectColors } from "../../../projectColors";
import type { ProjectColorFieldProps } from "../../ProjectColorField";

const cellClass =
	"group relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-opacity duration-hover pointer-coarse:size-11 max-sm:size-11 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 data-checked:outline-2 data-checked:outline-offset-2 data-checked:outline-fg";

export function ProjectColorGrid({ value, taken, onValueChange, label = "Color" }: ProjectColorFieldProps) {
	const free = freeProjectColors(taken, value);
	return (
		<RadioGroup
			aria-label={label}
			value={value ?? "none"}
			onValueChange={(next) => onValueChange(next === "none" ? null : (next as typeof value))}
			className="grid w-fit grid-cols-5 gap-1"
		>
			{projectColors.map((color) => {
				const held = !free.includes(color);
				return (
					<Radio.Root
						key={color}
						value={color}
						disabled={held}
						data-project-color={color}
						aria-label={held ? `${projectColorLabels[color]}, another project holds it` : projectColorLabels[color]}
						onClick={() => {
							if (color === value) onValueChange(color);
						}}
						className={cx(cellClass, "project-swatch border-transparent", held ? "opacity-30" : "cursor-pointer")}
					>
						<Radio.Indicator className="inline-flex">
							<Check aria-hidden="true" weight="bold" className="size-4" />
						</Radio.Indicator>
					</Radio.Root>
				);
			})}
			<Radio.Root
				value="none"
				aria-label="No color"
				onClick={() => {
					if (value === null) onValueChange(null);
				}}
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
	);
}
