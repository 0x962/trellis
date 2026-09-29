import { ArrowDown, ArrowLineUp, ArrowClockwise, CaretDown, CaretRight } from "@phosphor-icons/react";
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { cx } from "../../../../utils/cx";
import { FailureState } from "../../../FailureState";
import type { SessionStatusPaneProps, SessionUpdate } from "../../types";
import { localDay, timelineGroups, updateTitle } from "../timelineGroups";
import { TimelineScrollAnchor } from "../TimelineScrollAnchor";
import { UpdateContent } from "../UpdateContent";

type Props = Pick<SessionStatusPaneProps, "now" | "renderMarkdown" | "onOpenLink" | "historyControl"> & {
	updates: SessionUpdate[];
};

export function StatusTimeline({ updates, now, renderMarkdown, onOpenLink, historyControl }: Props) {
	const revision = updates.map((update) => update.id).join(":");
	const [retained, setRetained] = useState({ revision, updates });
	if (retained.revision !== revision) {
		setRetained({
			revision,
			updates: [...new Map([...retained.updates, ...updates].map((update) => [update.id, update])).values()],
		});
	}
	const [selected, setSelected] = useState(updates[0]!);
	const [focused, setFocused] = useState(selected.id);
	const [closed, setClosed] = useState(new Set<string>());
	const [seen, setSeen] = useState(updates[0]!.id);
	const root = useRef<HTMLUListElement>(null);
	const pendingFocus = useRef<string | null>(null);
	const helpId = useId();
	const groups = timelineGroups(retained.updates, now);
	const latest = groups[0]!.updates[0]!;
	const newUpdate = latest.id !== seen;
	const newCount = Math.max(
		1,
		groups.flatMap((group) => group.updates).findIndex((update) => update.id === seen),
	);
	const nodes = groups.flatMap((group) => [
		group.key,
		...(closed.has(group.key) ? [] : group.updates.map((u) => u.id)),
	]);
	const focus = (key: string) => {
		pendingFocus.current = key;
		setFocused(key);
	};
	useLayoutEffect(() => {
		const key = pendingFocus.current;
		if (key === null) return;
		pendingFocus.current = null;
		const item = [...root.current!.querySelectorAll<HTMLElement>("[data-tree-key]")].find(
			(node) => node.dataset.treeKey === key,
		)!;
		item.focus({ preventScroll: true });
		item.querySelector<HTMLElement>("[data-row-head]")!.scrollIntoView({ block: "nearest" });
	});
	const toggle = (day: string) => {
		setClosed((value) => {
			const next = new Set(value);
			if (next.has(day)) next.delete(day);
			else next.add(day);
			return next;
		});
		focus(day);
	};
	const select = (update: SessionUpdate) => {
		setSelected(update);
		setClosed((value) => {
			const next = new Set(value);
			next.delete(localDay(update.createdAt));
			return next;
		});
		if (update.id === latest.id) setSeen(latest.id);
		focus(update.id);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, key: string, day: string, update?: SessionUpdate) => {
		if (event.target !== event.currentTarget) return;
		const index = nodes.indexOf(key);
		switch (event.key) {
			case "ArrowDown":
				focus(nodes[Math.min(nodes.length - 1, index + 1)]!);
				break;
			case "ArrowUp":
				focus(nodes[Math.max(0, index - 1)]!);
				break;
			case "Home":
				focus(nodes[0]!);
				break;
			case "End":
				focus(nodes.at(-1)!);
				break;
			case "Enter":
			case " ":
				if (update) select(update);
				else toggle(day);
				break;
			case "ArrowLeft":
				if (update) focus(day);
				else if (!closed.has(day)) toggle(day);
				break;
			case "ArrowRight":
				if (!update) {
					if (closed.has(day)) toggle(day);
					else focus(nodes[index + 1]!);
				}
				break;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
	};
	return (
		<>
			<div className="sticky top-0 z-10 flex min-h-11 items-center justify-between gap-3 bg-bg">
				<h2 className="text-sm font-medium">Updates</h2>
				<Tooltip content="Go to latest update">
					<IconButton
						className="max-md:size-11"
						label="Go to latest update"
						icon={<ArrowLineUp />}
						onClick={() => select(latest)}
					/>
				</Tooltip>
			</div>
			<p role="status" aria-live="polite" className="sr-only">
				{newUpdate
					? `${newCount} new update${newCount === 1 ? " is" : "s are"} available. Your selected update stays open.`
					: ""}
			</p>
			<TimelineScrollAnchor revision={revision}>
				{newUpdate && <p className="py-2 text-xs text-agent">New update available. Use Go to latest update.</p>}
				<ul ref={root} role="tree" aria-label="Update history" aria-describedby={helpId} className="min-w-0">
					{groups.map((group) => (
						<li
							key={group.key}
							role="treeitem"
							aria-label={group.label}
							aria-expanded={!closed.has(group.key)}
							tabIndex={focused === group.key ? 0 : -1}
							data-tree-key={group.key}
							onFocus={(event) => {
								if (event.target === event.currentTarget) setFocused(group.key);
							}}
							onKeyDown={(event) => onKeyDown(event, group.key, group.key)}
							onClick={(event) => {
								if ((event.target as Element).closest('[role="treeitem"]') === event.currentTarget) toggle(group.key);
							}}
							className="outline-none focus-visible:[&>div]:outline-2 focus-visible:[&>div]:outline-accent"
						>
							<div
								data-row-head
								className="flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-1 text-xs text-fg-muted hover:bg-fg/6 active:bg-fg/10 max-md:min-h-11"
							>
								{closed.has(group.key) ? (
									<CaretRight aria-hidden className="size-3" />
								) : (
									<CaretDown aria-hidden className="size-3" />
								)}
								<span>{group.label}</span>
								<span className="tabular text-fg-faint">{group.updates.length}</span>
							</div>
							{!closed.has(group.key) && (
								<ul role="group" className="ms-3.5 border-s border-border-strong">
									{group.updates.map((update) => (
										<li
											key={update.id}
											role="treeitem"
											aria-label={`${new Date(update.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, ${updateTitle(update.body)}`}
											aria-selected={selected.id === update.id}
											tabIndex={focused === update.id ? 0 : -1}
											data-tree-key={update.id}
											data-update-id={update.id}
											onFocus={(event) => {
												if (event.target === event.currentTarget) setFocused(update.id);
											}}
											onKeyDown={(event) => onKeyDown(event, update.id, group.key, update)}
											onClick={(event) => {
												if (!(event.target as Element).closest("article")) select(update);
											}}
											className="relative min-w-0 outline-none focus-visible:[&>div:first-child]:outline-2 focus-visible:[&>div:first-child]:outline-accent"
										>
											<div
												data-row-head
												className="relative flex min-h-11 cursor-pointer items-start rounded-sm py-2 ps-5 pe-1 hover:bg-fg/6 active:bg-fg/10 max-md:min-h-13 max-md:ps-7"
											>
												<span
													aria-hidden
													className="absolute -start-3.5 top-0 flex min-h-11 w-7 items-center justify-center max-md:-start-5.5 max-md:min-h-13 max-md:w-11"
												>
													<span
														className={cx(
															"size-2.5 rounded-round border-2",
															selected.id === update.id
																? "border-agent bg-agent ring-4 ring-agent/15"
																: "border-fg-faint bg-bg",
														)}
													/>
												</span>
												<span className="min-w-0 flex-1">
													<span className="flex gap-2 text-xs text-fg-faint">
														<time dateTime={update.createdAt} className="tabular">
															{new Date(update.createdAt).toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</time>
														{update.id === latest.id && <span className="text-agent">Latest</span>}
													</span>
													<span
														className={cx(
															"block truncate text-sm",
															selected.id === update.id ? "font-medium text-fg" : "text-fg-muted",
														)}
													>
														{updateTitle(update.body)}
													</span>
												</span>
											</div>
											{selected.id === update.id && (
												<div className="min-w-0 pb-5 ps-5 pe-1 max-md:ps-7">
													<UpdateContent update={update} renderMarkdown={renderMarkdown} onOpenLink={onOpenLink} />
												</div>
											)}
										</li>
									))}
								</ul>
							)}
						</li>
					))}
				</ul>
			</TimelineScrollAnchor>
			{historyControl?.error && (
				<FailureState
					variant="section"
					title="The update history did not load"
					action={
						<Tooltip content="Retry history">
							<IconButton
								className="max-md:size-11"
								label="Retry history"
								icon={<ArrowClockwise />}
								onClick={historyControl.retry}
							/>
						</Tooltip>
					}
				/>
			)}
			{historyControl?.hasMore && (
				<Tooltip content="Load older updates">
					<IconButton
						className="max-md:size-11"
						label="Load older updates"
						icon={<ArrowDown />}
						processing={historyControl.loading}
						onClick={historyControl.load}
					/>
				</Tooltip>
			)}
			<p id={helpId} className="mt-3 text-xs text-fg-faint">
				Up/Down: Browse. Left/Right: Fold days. Enter: Select.
			</p>
		</>
	);
}
