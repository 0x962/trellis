import { useState } from "react";
import { ProjectColorField } from "../../../../domain/ProjectColorField";
import { type ProjectColor, projectColors } from "../../../../domain/projectColors";
import { Input } from "../../../../primitives/Input";
import { Textarea } from "../../../../primitives/Textarea";
import { Section } from "../../Section";

export function ProjectColorFieldSection() {
	const [color, setColor] = useState<ProjectColor | null>(projectColors[0]!);
	const [empty, setEmpty] = useState<ProjectColor | null>(null);
	const [blurCount, setBlurCount] = useState(0);
	return (
		<Section
			name="ProjectColorField"
			note="Open the picker to see the fixed palette. Faint colours belong to other projects."
			className="items-start"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<Input label="Name" defaultValue="Workbench" />
				<Input label="Key" defaultValue="WO" />
				<ProjectColorField
					label="Colour"
					value={color}
					taken={projectColors.filter((_, index) => index % 4 === 1)}
					onValueChange={setColor}
					onBlur={() => setBlurCount((count) => count + 1)}
				/>
				<Textarea label="Description" defaultValue="Hardware for your workbench." />
				<output className="text-sm text-fg-muted tabular-nums">Focus left the picker: {blurCount}</output>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<ProjectColorField label="Empty" value={empty} taken={projectColors} onValueChange={setEmpty} />
				<ProjectColorField label="Disabled" value={projectColors[0]!} taken={[]} onValueChange={() => {}} disabled />
			</div>
		</Section>
	);
}
