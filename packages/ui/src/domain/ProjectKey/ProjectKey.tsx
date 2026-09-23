import { cx } from "../../utils/cx";
import type { ProjectColor } from "../projectColors";

export type ProjectKeyProps = {
	projectKey: string;
	// `null` draws the grey chip. A color draws the key in that color, on
	// the soft ground of it.
	color: ProjectColor | null;
	className?: string;
};

// A root project's key as a small mono tag: `CDE`.
export function ProjectKey({ projectKey, color, className }: ProjectKeyProps) {
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
