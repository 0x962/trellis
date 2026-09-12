import { PencilSimple } from "@phosphor-icons/react";
import { type ComponentProps, cloneElement, type ReactElement } from "react";
import { IconButton } from "../IconButton";

export type EntityCardProps = {
	title: string;
	description: string;
} & (
	| { link: ReactElement<ComponentProps<"a">>; onEdit?: never; editLabel?: never }
	| { link?: never; onEdit: () => void; editLabel?: string }
);

export function EntityCard({ title, description, onEdit, editLabel, link }: EntityCardProps) {
	return (
		<article
			aria-label={title}
			className="group relative flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-hover hover:border-border-strong focus-within:border-accent"
		>
			<div className="flex items-start gap-3">
				<h3 className="min-w-0 flex-1 break-words text-base font-medium text-fg">
					{link
						? cloneElement(link, {
								className:
									"cursor-pointer after:absolute after:inset-0 after:rounded-lg focus:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent focus-visible:after:outline-offset-2",
								children: title,
							})
						: title}
				</h3>
				{!link && <IconButton label={editLabel ?? `Edit ${title}`} icon={<PencilSimple />} onClick={onEdit} />}
			</div>
			<p className="line-clamp-4 min-h-20 whitespace-pre-wrap break-words text-sm leading-5 text-fg-muted">
				{description}
			</p>
		</article>
	);
}
