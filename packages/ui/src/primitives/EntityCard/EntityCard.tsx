import { Pencil } from "lucide-react";
import { IconButton } from "../IconButton";

export type EntityCardProps = {
	title: string;
	description: string;
	onEdit: () => void;
	editLabel?: string;
};

// One named thing and the text that describes it, with the control that
// opens it for editing.
export function EntityCard({ title, description, onEdit, editLabel }: EntityCardProps) {
	return (
		<article
			aria-label={title}
			className="group flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-hover hover:border-border-strong focus-within:border-accent"
		>
			<div className="flex items-start gap-3">
				<h3 className="min-w-0 flex-1 break-words text-base font-medium text-fg">{title}</h3>
				<IconButton label={editLabel ?? `Edit ${title}`} icon={<Pencil />} onClick={onEdit} />
			</div>
			<p className="line-clamp-4 min-h-20 whitespace-pre-wrap break-words text-sm leading-5 text-fg-muted">
				{description}
			</p>
		</article>
	);
}
