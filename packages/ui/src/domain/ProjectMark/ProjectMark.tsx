import { cx } from "../../utils/cx";
import type { ProjectColor } from "../projectColors";
import { TrellisMark } from "../TrellisMark";

export type ProjectMarkProps = {
	color: ProjectColor | null;
	className?: string;
};

// The mark of one project. The four strands keep the shape of the trellis
// mark.
//
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
