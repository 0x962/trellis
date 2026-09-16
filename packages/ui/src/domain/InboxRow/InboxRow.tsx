import { DotsThree } from "@phosphor-icons/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { type ActorKind, Avatar } from "../../primitives/Avatar";
import { IconButton } from "../../primitives/IconButton";
import { Menu, type MenuItem } from "../../primitives/Menu";
import { Tooltip } from "../../primitives/Tooltip";
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
	actor?: { name: string; kind: ActorKind };
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
			className="group flex min-h-11 items-center gap-2 border-b border-border px-4 py-2 hover:bg-elevated focus-within:bg-elevated"
		>
			<div className="min-w-0 flex-1">
				{cloneElement(link, {
					className: "block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent",
					children: (
						<>
							<div className="flex min-w-0 items-center gap-2">
								<PriorityIcon priority={priority} />
								<TicketId id={identifier} />
								<span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{title}</span>
								<span className="hidden shrink-0 items-center gap-2 text-xs text-fg-muted md:inline-flex">
									{status}
									<span className="max-w-32 truncate">{project}</span>
								</span>
								{actor && <Avatar {...actor} />}
								<time
									dateTime={createdAt}
									title={`Created ${new Date(createdAt).toLocaleString()}`}
									className="w-10 shrink-0 text-right text-xs text-fg-faint tabular"
								>
									{age}
								</time>
							</div>
							{snippet && (
								<p className="mt-1 truncate text-sm text-fg-muted">
									<span className="font-medium">{sender}: </span>
									{snippet}
								</p>
							)}
							{wake && <p className="mt-1 text-xs text-fg-muted">Snoozed until {new Date(wake).toLocaleString()}</p>}
						</>
					),
				})}
			</div>
			<div>
				<Tooltip content="Item options">
					<Menu
						label="Item options"
						trigger={<IconButton label="Item options" icon={<DotsThree />} />}
						items={actions}
					/>
				</Tooltip>
			</div>
		</li>
	);
}
