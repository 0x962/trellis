import { ArrowLineUp } from "@phosphor-icons/react";
import { type KeyboardEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import type { SessionStatusPaneProps, SessionUpdate } from "../../types";
import { TimelineTree } from "./components/TimelineTree";
import { localDay, timelineGroups } from "./components/timelineGroups";

type Props = Pick<SessionStatusPaneProps, "now" | "renderMarkdown" | "onOpenLink"> & {
	updates: SessionUpdate[];
};

export function StatusTimeline({ updates, now, renderMarkdown, onOpenLink }: Props) {
	const revision = useMemo(() => updates.map((update) => update.id).join(":"), [updates]);
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
	const root = useRef<HTMLDivElement>(null);
	const pendingFocus = useRef<string | null>(null);
	const helpId = useId();
	const date = new Date(now);
	const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
	const groups = useMemo(() => timelineGroups(retained.updates, day), [retained.updates, day]);
	const latest = groups[0]!.updates[0]!;
	const newUpdate = latest.id !== seen;
	const newCount = useMemo(
		() =>
			Math.max(
				1,
				groups.flatMap((group) => group.updates).findIndex((update) => update.id === seen),
			),
		[groups, seen],
	);
	const nodes = useMemo(
		() => groups.flatMap((group) => [group.key, ...(closed.has(group.key) ? [] : group.updates.map((u) => u.id))]),
		[groups, closed],
	);
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
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, key: string, day: string, update?: SessionUpdate) => {
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
			<div className="sticky top-0 z-(--layer-sticky-content) flex min-h-11 items-center justify-between gap-3 bg-bg">
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

			<TimelineTree
				root={root}
				groups={groups}
				closed={closed}
				focused={focused}
				selected={selected.id}
				latest={latest.id}
				newUpdate={newUpdate}
				helpId={helpId}
				onKeyDown={onKeyDown}
				onFocus={setFocused}
				onToggle={toggle}
				onSelect={select}
				renderMarkdown={renderMarkdown}
				onOpenLink={onOpenLink}
			/>
			<p id={helpId} className="mt-3 text-xs text-fg-faint">
				Up/Down: Browse. Left/Right: Fold days. Enter: Select.
			</p>
		</>
	);
}
