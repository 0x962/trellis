import { useState } from "react";
import { ProjectColorField } from "../../../../domain/ProjectColorField";
import { type ProjectColor, projectColors } from "../../../../domain/projectColors";
import { Section } from "../../Section";

// The colors the other projects of the gallery hold. Their cells are drawn
// faint and take no click.
const takenBySomebodyElse: readonly ProjectColor[] = ["red", "amber", "moss", "teal", "indigo", "rose"];

export function ProjectColorFieldSection() {
	const [color, setColor] = useState<ProjectColor | null>("blue");
	return (
		<Section
			name="ProjectColorField"
			note="all 25 names at once in palette order, the last cell for no color; a name another project holds is faint"
			className="flex-col items-stretch"
		>
			<ProjectColorField value={color} taken={takenBySomebodyElse} onValueChange={setColor} />
			<ProjectColorField value={null} taken={projectColors} onValueChange={() => {}} />
		</Section>
	);
}
