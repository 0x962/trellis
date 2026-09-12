import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../IconButton";

export type EntityCardProps = {
	title: string;
	description: string;
	icon?: ReactNode;
	footer?: ReactNode;
	onEdit: () => void;
	editLabel?: string;
};

export function EntityCard({ title, description, icon, footer, onEdit, editLabel }: EntityCardProps) {
	return (
		<article
			aria-label={title}
			className="group flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-hover hover:border-border-strong focus-within:border-accent"
		>
			<div className="flex items-start gap-3">
				{icon && (
					<span
						aria-hidden="true"
						className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-fg-muted *:size-4"
					>
						{icon}
					</span>
				)}
				<h3 className="min-w-0 flex-1 break-words pt-1 text-base font-medium text-fg">{title}</h3>
				<IconButton label={editLabel ?? `Edit ${title}`} icon={<Pencil />} onClick={onEdit} />
			</div>
			<p className="line-clamp-4 min-h-20 whitespace-pre-wrap break-words text-sm leading-5 text-fg-muted">
				{description}
			</p>
			{footer && <div className="mt-auto border-t border-border pt-3 text-xs text-fg-faint">{footer}</div>}
		</article>
	);
}
