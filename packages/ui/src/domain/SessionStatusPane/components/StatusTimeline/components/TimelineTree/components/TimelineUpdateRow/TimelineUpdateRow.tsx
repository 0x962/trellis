import { type KeyboardEvent, useMemo } from "react";
import { cx } from "../../../../../../../../utils/cx";
import type { SessionStatusPaneProps, SessionUpdate } from "../../../../../../types";
import { updateTitle } from "../../../timelineGroups";
import { UpdateContent } from "./components/UpdateContent";

type Props = Pick<SessionStatusPaneProps, "renderMarkdown" | "onOpenLink"> & {
	update: SessionUpdate;
	selected: boolean;
	focused: boolean;
	latest: boolean;
	position: number;
	count: number;
	onFocus: () => void;
	onSelect: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export function TimelineUpdateRow({
	update,
	selected,
	focused,
	latest,
	position,
	count,
	onFocus,
	onSelect,
	onKeyDown,
	renderMarkdown,
	onOpenLink,
}: Props) {
	const title = useMemo(() => updateTitle(update.body), [update.body]);
	const time = useMemo(
		() => new Date(update.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
		[update.createdAt],
	);
	return (
		<div
			role="treeitem"
			aria-label={`${time}, ${title}`}
			aria-selected={selected}
			aria-level={2}
			aria-posinset={position}
			aria-setsize={count}
			tabIndex={focused ? 0 : -1}
			data-tree-key={update.id}
			data-update-id={update.id}
			onFocus={(event) => {
				if (event.target === event.currentTarget) onFocus();
			}}
			onKeyDown={onKeyDown}
			onClick={(event) => {
				if (!(event.target as Element).closest("article")) onSelect();
			}}
			className="relative min-w-0 outline-none focus-visible:[&>[data-row-head]]:outline-2 focus-visible:[&>[data-row-head]]:outline-accent"
		>
			<div
				data-row-head
				className="relative flex min-h-11 scroll-mt-14 cursor-pointer items-start rounded-sm py-2 ps-5 pe-1 hover:bg-fg/6 active:bg-fg/10 max-md:min-h-13 max-md:ps-7"
			>
				<span
					aria-hidden
					className="absolute -start-3.5 top-0 flex min-h-11 w-7 items-center justify-center max-md:-start-5.5 max-md:min-h-13 max-md:w-11"
				>
					<span
						className={cx(
							"size-2.5 rounded-round border-[length:calc(var(--border-width-hairline)*2)]",
							selected ? "border-agent bg-agent ring-4 ring-agent/15" : "border-fg-faint bg-bg",
						)}
					/>
				</span>
				<span className="min-w-0 flex-1">
					<span className="flex gap-2 text-xs text-fg-faint">
						<time dateTime={update.createdAt} className="tabular">
							{time}
						</time>
						{latest && <span className="text-agent">Latest</span>}
					</span>
					<span className={cx("block truncate text-sm", selected ? "font-medium text-fg" : "text-fg-muted")}>
						{title}
					</span>
				</span>
			</div>
			{selected && (
				<div className="min-w-0 pb-5 ps-5 pe-1 max-md:ps-7">
					<UpdateContent update={update} renderMarkdown={renderMarkdown} onOpenLink={onOpenLink} />
				</div>
			)}
		</div>
	);
}
