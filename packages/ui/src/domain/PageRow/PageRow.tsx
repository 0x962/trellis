import { ChatCircle, DotsThree, PushPinSimple } from "@phosphor-icons/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Menu, type MenuItem } from "../../primitives/Menu";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type PageRowProps = {
	title: string;
	summary: string;
	latestVersion: number;
	publishedBy: string;
	publishedAt: string;
	age: string;
	watcher: string | null;
	openThreadCount: number;
	pinned: boolean;
	deleted: boolean;
	link: ReactElement<{ className?: string; children?: ReactNode }>;
	actions?: readonly MenuItem[];
};

export function PageRow({
	title,
	summary,
	latestVersion,
	publishedBy,
	publishedAt,
	age,
	watcher,
	openThreadCount,
	pinned,
	deleted,
	link,
	actions = [],
}: PageRowProps) {
	return (
		<li
			data-page-row=""
			className={cx(
				"group/row relative flex min-h-14 items-stretch border-b border-border transition-colors duration-hover hover:bg-band focus-within:bg-accent-soft/60",
				deleted && "opacity-60",
			)}
		>
			{cloneElement(link, {
				className:
					"grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_3.5rem_7rem_7rem_3rem_3rem] items-center gap-3 px-5 py-1.5 text-sm outline-none focus-visible:before:absolute focus-visible:before:inset-y-1 focus-visible:before:left-0 focus-visible:before:w-0.5 focus-visible:before:bg-accent max-md:grid-cols-[minmax(0,1fr)_3rem] max-md:gap-x-2 max-md:px-4",
				children: (
					<>
						<span className="flex min-w-0 flex-col">
							<span className="flex min-w-0 items-center gap-1.5 font-medium text-fg">
								{pinned && (
									<Tooltip content="Pinned">
										<PushPinSimple aria-label="Pinned" weight="fill" className="size-3.5 shrink-0 text-accent" />
									</Tooltip>
								)}
								<span className="truncate">{title}</span>
								{deleted && <span className="shrink-0 text-xs text-danger">Deleted</span>}
							</span>
							<span className="truncate text-xs text-fg-muted">{summary || "No summary"}</span>
						</span>
						<span className="text-fg-muted tabular max-md:hidden">v{latestVersion}</span>
						<span className="truncate text-fg-muted max-md:hidden" title={publishedBy}>
							{publishedBy}
						</span>
						<span className="truncate text-fg-muted max-md:hidden" title={watcher ?? "No watcher"}>
							{watcher ?? "No watcher"}
						</span>
						<span className="flex items-center justify-end gap-1 text-fg-muted tabular max-md:hidden">
							{openThreadCount > 0 && (
								<>
									<ChatCircle aria-hidden="true" className="size-3.5" />
									<span>{openThreadCount}</span>
								</>
							)}
						</span>
						<time
							dateTime={publishedAt}
							title={new Date(publishedAt).toLocaleString()}
							className="text-right text-fg-faint tabular"
						>
							{age}
						</time>
						<span className="col-span-2 hidden truncate text-xs text-fg-muted max-md:block">
							v{latestVersion} · {publishedBy} · {watcher ?? "No watcher"}
							{openThreadCount > 0 && ` · ${openThreadCount} open`}
						</span>
					</>
				),
			})}
			<span className="flex w-9 shrink-0 items-center justify-center max-md:w-11">
				{actions.length > 0 && (
					<Menu
						label={`Actions for ${title}`}
						triggerTooltip="Page actions"
						trigger={
							<IconButton
								label={`Actions for ${title}`}
								icon={<DotsThree />}
								className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
							/>
						}
						items={actions}
					/>
				)}
			</span>
		</li>
	);
}
