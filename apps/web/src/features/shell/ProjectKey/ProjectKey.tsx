import { cx } from "@trellis/ui";

export type ProjectKeyProps = {
	projectKey: string;
	className?: string;
};

// A root project's key as a small mono tag: `CDE`.
export function ProjectKey({ projectKey, className }: ProjectKeyProps) {
	return (
		<span
			className={cx(
				"inline-flex h-4.5 shrink-0 items-center rounded-sm border border-border bg-surface px-1 text-kbd text-fg-muted",
				className,
			)}
		>
			{projectKey}
		</span>
	);
}
