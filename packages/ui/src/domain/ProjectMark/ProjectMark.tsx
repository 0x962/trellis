import { cx } from "../../utils/cx";
import type { ProjectColor } from "../projectColors";
import { TrellisMark } from "../TrellisMark";

export type ProjectMarkProps = {
	color: ProjectColor | null;
	className?: string;
};

// The mark of one project. The four strands keep the shape of the trellis
// mark, and the ground of the mark carries the color of the project.
//
// A project that holds no color draws the plain mark with no ground, which
// puts the strands on the ground of the page in the muted text color.
// The row, the chip or the link around the mark carries the name of the
// project, so the mark itself stays hidden from a screen reader.
export function ProjectMark({ color, className = "size-4" }: ProjectMarkProps) {
	if (color === null) return <TrellisMark className={className} background={false} />;
	return (
		<span aria-hidden="true" className={cx("project-mark inline-flex", className)} data-project-color={color}>
			<TrellisMark className="size-full" />
		</span>
	);
}
