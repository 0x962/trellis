import { cx } from "../../utils/cx";
import type { ProjectColor } from "../projectColors";

export type ProjectKeyProps = {
	projectKey: string;
	// The color of the project. The chip then carries that color: the key
	// stands in the color on the soft ground of it. A project with `null`
	// keeps the grey chip.
	color?: ProjectColor | null;
	className?: string;
};

// A root project's key as a small mono tag: `CDE`.
export function ProjectKey({ projectKey, color = null, className }: ProjectKeyProps) {
	return (
		<span
			data-project-color={color ?? undefined}
			className={cx(
				"inline-flex h-4.5 shrink-0 items-center rounded-sm px-1 text-kbd",
				color === null ? "border border-border bg-surface text-fg-muted" : "project-chip",
				className,
			)}
		>
			{projectKey}
		</span>
	);
}
