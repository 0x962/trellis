import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { type KeyboardEvent, type RefObject, useMemo } from "react";
import type { SessionStatusPaneProps, SessionUpdate } from "../../../../types";
import type { timelineGroups } from "../timelineGroups";
import { MeasuredTimelineRow } from "./components/MeasuredTimelineRow";
import { TimelineScrollAnchor } from "./components/TimelineScrollAnchor";
import { TimelineUpdateRow } from "./components/TimelineUpdateRow";
import { useTimelineWindow } from "./components/useTimelineWindow";

type Props = Pick<SessionStatusPaneProps, "renderMarkdown" | "onOpenLink"> & {
	root: RefObject<HTMLDivElement | null>;
	groups: ReturnType<typeof timelineGroups>;
	closed: Set<string>;
	focused: string;
	selected: string;
	latest: string;
	newUpdate: boolean;
	helpId: string;
	onKeyDown: (event: KeyboardEvent<HTMLDivElement>, key: string, day: string, update?: SessionUpdate) => void;
	onFocus: (key: string) => void;
	onToggle: (key: string) => void;
	onSelect: (update: SessionUpdate) => void;
};

export function TimelineTree({
	root,
	groups,
	closed,
	focused,
	selected,
	latest,
	newUpdate,
	helpId,
	onKeyDown,
	onFocus,
	onToggle,
	onSelect,
	renderMarkdown,
	onOpenLink,
}: Props) {
	const model = useMemo(() => {
		const rows: { key: string; day: string; expanded: boolean; isDay: boolean }[] = [];
		const days = new Map<string, { group: (typeof groups)[number]; start: number; end: number; position: number }>();
		for (const [position, group] of groups.entries()) {
			const start = rows.length;
			rows.push({ key: group.key, day: group.key, expanded: false, isDay: true });
			if (!closed.has(group.key))
				for (const update of group.updates)
					rows.push({ key: update.id, day: group.key, expanded: update.id === selected, isDay: false });
			days.set(group.key, { group, start, end: rows.length, position: position + 1 });
		}
		return { rows, days };
	}, [groups, closed, selected]);
	const window = useTimelineWindow(root, model.rows, focused, selected);
	const visibleDays = useMemo(() => {
		const result = new Map<string, number[]>();
		for (const index of window.indices) {
			const row = model.rows[index]!;
			let indices = result.get(row.day);
			if (!indices) {
				indices = [];
				result.set(row.day, indices);
			}
			if (!row.isDay) indices.push(index);
		}
		return result;
	}, [window.indices, model]);
	const revision = useMemo(() => ({ model, offsets: window.offsets, newUpdate }), [model, window.offsets, newUpdate]);
	return (
		<TimelineScrollAnchor revision={revision}>
			{newUpdate && <p className="py-2 text-xs text-agent">New update available. Use Go to latest update.</p>}
			<div
				ref={root}
				role="tree"
				aria-label="Update history"
				aria-describedby={helpId}
				className="relative min-w-0"
				style={{ height: window.offsets.at(-1) }}
			>
				{[...visibleDays].map(([key, indices]) => {
					const { group, start, end, position } = model.days.get(key)!;
					const top = window.offsets[start]!;
					const headerHeight = window.offsets[start + 1]! - top;
					const height = window.offsets[end]! - top;
					return (
						<div
							key={key}
							role="treeitem"
							aria-label={group.label}
							aria-expanded={!closed.has(key)}
							aria-level={1}
							aria-posinset={position}
							aria-setsize={groups.length}
							tabIndex={focused === key ? 0 : -1}
							data-tree-key={key}
							onFocus={(event) => {
								if (event.target === event.currentTarget) onFocus(key);
							}}
							onKeyDown={(event) => onKeyDown(event, key, key)}
							onClick={(event) => {
								if ((event.target as Element).closest('[role="treeitem"]') === event.currentTarget) onToggle(key);
							}}
							className="absolute inset-x-0 outline-none focus-visible:[&_[data-day-head]]:outline-2 focus-visible:[&_[data-day-head]]:outline-accent"
							style={{ top, height }}
						>
							<MeasuredTimelineRow measureKey={window.keys[start]!} measure={window.measure}>
								<div
									data-row-head
									data-day-head
									className="flex min-h-8 scroll-mt-14 cursor-pointer items-center gap-2 rounded-sm px-1 text-xs text-fg-muted hover:bg-fg/6 active:bg-fg/10 max-md:min-h-11"
								>
									{closed.has(key) ? (
										<CaretRight aria-hidden className="size-3" />
									) : (
										<CaretDown aria-hidden className="size-3" />
									)}
									<span>{group.label}</span>
									<span className="tabular text-fg-faint">{group.updates.length}</span>
								</div>
							</MeasuredTimelineRow>
							{!closed.has(key) && (
								// biome-ignore lint/a11y/useSemanticElements: A day owns its update tree items through this group.
								<div
									role="group"
									className="relative ms-3.5 border-s-hairline border-border-strong"
									style={{ height: height - headerHeight }}
								>
									{indices.map((index) => {
										const update = group.updates[index - start - 1]!;
										return (
											<div
												key={update.id}
												className="absolute inset-x-0"
												style={{ top: window.offsets[index]! - top - headerHeight }}
											>
												<MeasuredTimelineRow measureKey={window.keys[index]!} measure={window.measure}>
													<TimelineUpdateRow
														update={update}
														selected={selected === update.id}
														focused={focused === update.id}
														latest={latest === update.id}
														position={index - start}
														count={group.updates.length}
														onFocus={() => onFocus(update.id)}
														onSelect={() => onSelect(update)}
														onKeyDown={(event) => onKeyDown(event, update.id, key, update)}
														renderMarkdown={renderMarkdown}
														onOpenLink={onOpenLink}
													/>
												</MeasuredTimelineRow>
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</TimelineScrollAnchor>
	);
}
