import { defaultFilter } from "cmdk";
import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CommandItem, CommandGroup as Group } from "../../Command";
import { CommandEmpty } from "../CommandEmpty";
import { CommandField } from "../CommandField";
import { CommandGroup } from "../CommandGroup";
import { CommandList } from "../CommandList";
import { CommandRoot } from "../CommandRoot";
import { CommandRow } from "../CommandRow";

export type CommandVirtualProps = {
	items?: readonly CommandItem[];
	groups?: readonly Group[];
	onSearchChange?: (search: string) => void;
	onSelect: (id: string) => void;
	label?: string;
	placeholder?: string;
	empty?: string;
	inputRef?: RefObject<HTMLInputElement | null>;
};
const rowHeight = 44;
const emptyItems: readonly CommandItem[] = [];
const emptyGroups: readonly Group[] = [];

export function CommandVirtual({
	items = emptyItems,
	groups = emptyGroups,
	onSearchChange,
	onSelect,
	label = "Search",
	placeholder = "Search",
	empty = "No results.",
	inputRef,
}: CommandVirtualProps) {
	const [search, setSearch] = useState("");
	const sections = useMemo<Group[]>(
		() =>
			[{ items }, ...groups].map((group) => ({
				...group,
				items: group.items
					.map((item) => ({
						item,
						score: search ? defaultFilter(item.id, search, [item.label, ...(item.keywords ?? [])]) : 1,
					}))
					.filter(({ item, score }) => item.pinned || score > 0)
					.sort((a, b) => b.score - a.score)
					.map(({ item }) => item),
			})),
		[items, groups, search],
	);
	const layout = useMemo(() => {
		let height = 0;
		const matches: { item: CommandItem; top: number; section: number }[] = [];
		const starts = sections.map((section, index) => {
			const top = height;
			if (section.items.length && section.heading !== undefined) height += 28;
			for (const item of section.items) {
				matches.push({ item, top: height, section: index });
				height += rowHeight;
			}
			return top;
		});
		return { matches, starts, height };
	}, [sections]);
	const { matches } = layout;
	const [cursor, setCursor] = useState(() =>
		Math.max(
			0,
			matches.findIndex(({ item }) => item.current || item.checked),
		),
	);
	const [top, setTop] = useState(0);
	const list = useRef<HTMLDivElement>(null);
	const selected = Math.min(cursor, Math.max(0, matches.length - 1));
	const start = Math.max(0, matches.findIndex((match) => match.top + rowHeight > top) - 2);
	const end = Math.min(matches.length, start + 12);
	const indexes = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
	if (matches.length && !indexes.includes(selected)) indexes.push(selected);
	useLayoutEffect(() => {
		const element = list.current!;
		const y = (matches[selected]?.top ?? 0) + 4;
		if (y < element.scrollTop) element.scrollTop = y;
		if (y + rowHeight > element.scrollTop + element.clientHeight)
			element.scrollTop = y + rowHeight - element.clientHeight;
		setTop(element.scrollTop);
	}, [selected, matches]);
	return (
		<CommandRoot
			label={label}
			shouldFilter={false}
			value={matches[selected]?.item.id ?? ""}
			onValueChange={(id) =>
				setCursor(
					Math.max(
						0,
						matches.findIndex(({ item }) => item.id === id),
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
					onSelect(matches[selected].item.id);
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
					onSearchChange?.(value);
					setCursor(0);
					list.current!.scrollTop = 0;
					setTop(0);
				}}
			/>
			<CommandList ref={list} className="max-h-66" onScroll={(event) => setTop(event.currentTarget.scrollTop)}>
				{matches.length === 0 && <CommandEmpty>{empty}</CommandEmpty>}
				<div className="relative" style={{ height: layout.height }}>
					{[...new Set(indexes.map((index) => matches[index]!.section))].map((sectionIndex) => {
						const section = sections[sectionIndex]!;
						const rows = indexes
							.filter((index) => matches[index]!.section === sectionIndex)
							.map((index) => {
								const { item, top } = matches[index]!;
								return (
									<CommandRow
										key={item.id}
										value={item.id}
										label={item.label}
										checked={item.checked ?? item.current}
										aria-posinset={index + 1}
										aria-setsize={matches.length}
										style={{
											position: "absolute",
											top: top - layout.starts[sectionIndex]!,
											width: "100%",
											height: rowHeight,
										}}
										onSelect={() => onSelect(item.id)}
									/>
								);
							});
						return (
							<div key={sectionIndex} style={{ position: "absolute", top: layout.starts[sectionIndex], width: "100%" }}>
								{section.heading === undefined ? rows : <CommandGroup heading={section.heading}>{rows}</CommandGroup>}
							</div>
						);
					})}
				</div>
			</CommandList>
		</CommandRoot>
	);
}
