import { defaultFilter } from "cmdk";
import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CommandItem } from "../../Command";
import { CommandEmpty } from "../CommandEmpty";
import { CommandField } from "../CommandField";
import { CommandList } from "../CommandList";
import { CommandRoot } from "../CommandRoot";
import { CommandRow } from "../CommandRow";

export type CommandVirtualProps = {
	items: readonly Pick<CommandItem, "id" | "label" | "keywords" | "current">[];
	onSelect: (id: string) => void;
	label?: string;
	placeholder?: string;
	empty?: string;
	inputRef?: RefObject<HTMLInputElement | null>;
};
const rowHeight = 44;

export function CommandVirtual({
	items,
	onSelect,
	label = "Search",
	placeholder = "Search",
	empty = "No results.",
	inputRef,
}: CommandVirtualProps) {
	const [search, setSearch] = useState("");
	const [cursor, setCursor] = useState(() =>
		Math.max(
			0,
			items.findIndex((item) => item.current),
		),
	);
	const [top, setTop] = useState(0);
	const list = useRef<HTMLDivElement>(null);
	const matches = useMemo(() => {
		if (!search) return items;
		return items
			.map((item) => ({ item, score: defaultFilter(item.id, search, [item.label, ...(item.keywords ?? [])]) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item);
	}, [items, search]);
	const selected = Math.min(cursor, Math.max(0, matches.length - 1));
	const start = Math.max(0, Math.floor(top / rowHeight) - 2);
	const end = Math.min(matches.length, start + 12);
	const indexes = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
	if (matches.length && !indexes.includes(selected)) indexes.push(selected);
	useLayoutEffect(() => {
		const element = list.current!;
		const y = selected * rowHeight + 4;
		if (y < element.scrollTop) element.scrollTop = y;
		if (y + rowHeight > element.scrollTop + element.clientHeight)
			element.scrollTop = y + rowHeight - element.clientHeight;
		setTop(element.scrollTop);
	}, [selected]);
	return (
		<CommandRoot
			label={label}
			shouldFilter={false}
			value={matches[selected]?.id ?? ""}
			onValueChange={(id) =>
				setCursor(
					Math.max(
						0,
						matches.findIndex((item) => item.id === id),
					),
				)
			}
			onKeyDownCapture={(event) => {
				const positions: Record<string, number> = {
					ArrowDown: Math.min(matches.length - 1, selected + 1),
					ArrowUp: Math.max(0, selected - 1),
					Home: 0,
					End: matches.length - 1,
					PageDown: Math.min(matches.length - 1, selected + 6),
					PageUp: Math.max(0, selected - 6),
				};
				const next = positions[event.key];
				if (next !== undefined) {
					event.preventDefault();
					event.stopPropagation();
					setCursor(Math.max(0, next));
				}
				if (event.key === "Enter" && !event.nativeEvent.isComposing && matches[selected]) {
					event.preventDefault();
					event.stopPropagation();
					onSelect(matches[selected].id);
				}
			}}
		>
			<CommandField
				inputRef={inputRef}
				label={label}
				placeholder={placeholder}
				value={search}
				onValueChange={(value) => {
					setSearch(value);
					setCursor(0);
					list.current!.scrollTop = 0;
					setTop(0);
				}}
			/>
			<CommandList ref={list} className="max-h-66" onScroll={(event) => setTop(event.currentTarget.scrollTop)}>
				{matches.length === 0 && <CommandEmpty>{empty}</CommandEmpty>}
				<div className="relative" style={{ height: matches.length * rowHeight }}>
					{indexes.map((index) => {
						const item = matches[index]!;
						return (
							<CommandRow
								key={item.id}
								value={item.id}
								label={item.label}
								checked={item.current}
								aria-posinset={index + 1}
								aria-setsize={matches.length}
								style={{ position: "absolute", top: index * rowHeight, width: "100%", height: rowHeight }}
								onSelect={() => onSelect(item.id)}
							/>
						);
					})}
				</div>
			</CommandList>
		</CommandRoot>
	);
}
