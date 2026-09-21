import { DotsThree } from "@phosphor-icons/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Menu, type MenuItem } from "../../primitives/Menu";
import { type Priority, PriorityIcon } from "../PriorityIcon";
import { TicketId } from "../TicketId";

export type InboxRowProps = {
	identifier: string;
	title: string;
	priority: Priority;
	project: string;
	status: ReactNode;
	age: string;
	createdAt: string;
	snippet?: string;
	sender?: string;
	actor?: ReactNode;
	wake?: string;
	link: ReactElement<{ className?: string; children?: ReactNode }>;
	actions: MenuItem[];
};

export function InboxRow({
	identifier,
	title,
	priority,
	project,
	status,
	age,
	createdAt,
	snippet,
	sender,
	actor,
	wake,
	link,
	actions,
}: InboxRowProps) {
	return (
		<li
			data-inbox-item=""
			data-identifier={identifier}
			className="group relative flex min-h-9 items-center gap-3 border-b border-border px-5 transition-colors duration-hover hover:bg-band focus-within:bg-accent-soft/60 max-md:gap-2 max-md:px-4"
		>
			{cloneElement(link, {
				className:
					"grid min-w-0 flex-1 grid-cols-[calc(var(--spacing)*4)_calc(var(--spacing)*18)_calc(var(--spacing)*4)_minmax(0,1fr)_calc(var(--spacing)*30)_calc(var(--spacing)*5)_calc(var(--spacing)*12)] items-center gap-x-3 py-2 text-sm outline-none focus-visible:before:absolute focus-visible:before:inset-y-1 focus-visible:before:left-0 focus-visible:before:w-0.5 focus-visible:before:bg-accent max-md:grid-cols-[calc(var(--spacing)*4)_calc(var(--spacing)*18)_calc(var(--spacing)*4)_minmax(0,1fr)_calc(var(--spacing)*12)] max-md:gap-x-2 max-md:gap-y-1",
				children: (
					<>
						<span data-column="status" className="flex items-center">
							{status}
						</span>
						<span data-column="id">
							<TicketId id={identifier} />
						</span>
						<span data-column="priority" className="flex items-center">
							<PriorityIcon priority={priority} />
						</span>
						<span
							data-column="title"
							className="min-w-0 truncate font-medium text-fg max-md:col-span-5 max-md:row-start-2"
						>
							{title}
						</span>
						<span data-column="project" title={project} className="truncate text-fg-muted max-md:hidden">
							{project}
						</span>
						<span data-column="actor" className="flex items-center justify-center max-md:hidden">
							{actor}
						</span>
						<time
							data-column="age"
							dateTime={createdAt}
							title={`Created ${new Date(createdAt).toLocaleString()}`}
							className="text-right text-fg-faint tabular max-md:col-start-5 max-md:row-start-1"
						>
							{age}
						</time>
						{snippet && (
							<p className="col-start-4 col-end-8 truncate text-fg-muted max-md:col-span-5">
								<span className="font-medium">{sender}: </span>
								{snippet}
							</p>
						)}
						{wake && (
							<p className="col-start-4 col-end-8 truncate text-xs text-fg-muted max-md:col-span-5">
								Snoozed until {new Date(wake).toLocaleString()}
							</p>
						)}
					</>
				),
			})}
			<Menu
				label="Item options"
				triggerTooltip="Item options"
				trigger={
					<IconButton
						label="Item options"
						icon={<DotsThree />}
						className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100 max-md:opacity-100"
					/>
				}
				items={actions}
			/>
		</li>
	);
}
