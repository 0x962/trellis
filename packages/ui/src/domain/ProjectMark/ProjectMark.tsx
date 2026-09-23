import { cx } from "../../utils/cx";
import type { ProjectColor } from "../projectColors";
import { TrellisMark } from "../TrellisMark";

export type ProjectMarkProps = {
	// The color of the project, or `null` for a project that holds none.
	color: ProjectColor | null;
	label?: string;
	className?: string;
};

// The mark of one project. The four strands keep the shape of the trellis
// mark, and the ground of the mark carries the color of the project.
//
// A project that holds no color draws the plain mark with no ground, which
// puts the strands on the ground of the page in the muted text color.
export function ProjectMark({ color, label, className = "size-4" }: ProjectMarkProps) {
	if (color === null) return <TrellisMark label={label} className={className} background={false} />;
	return (
		<span
			aria-hidden={label === undefined}
			className={cx("project-mark inline-flex", className)}
			data-project-color={color}
		>
			<TrellisMark label={label} className="size-full" />
		</span>
	);
}
