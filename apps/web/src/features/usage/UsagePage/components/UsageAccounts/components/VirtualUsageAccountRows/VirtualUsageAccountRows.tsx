import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { UsageAccount } from "@trellis/api";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const scrollParentOf = (node: HTMLElement | null): HTMLElement | null => {
	for (let element = node?.parentElement ?? null; element !== null; element = element.parentElement) {
		const overflow = getComputedStyle(element).overflowY;
		if (overflow === "auto" || overflow === "scroll") return element;
	}
	return null;
};

const offsetIn = (list: HTMLElement, scroller: HTMLElement) =>
	list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

const controlsOf = (row: Element) => [...row.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];

export function VirtualUsageAccountRows({
	accounts,
	renderRow,
}: {
	accounts: readonly UsageAccount[];
	renderRow: (account: UsageAccount, onActiveChange: (active: boolean) => void) => ReactNode;
}) {
	const list = useRef<HTMLDivElement>(null);
	const [scroller, setScroller] = useState<{ element: HTMLElement; margin: number } | null>(null);
	const [focusedKey, setFocusedKey] = useState<string>();
	const [activeKey, setActiveKey] = useState<string>();
	const wantsFocus = useRef<{ key: string; back: boolean } | null>(null);
	useLayoutEffect(() => {
		const element = scrollParentOf(list.current);
		if (element === null) return;
		const measure = () => {
			const margin = offsetIn(list.current!, element);
			setScroller((current) =>
				current !== null && current.element === element && current.margin === margin ? current : { element, margin },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		for (const child of element.children) observer.observe(child);
		element.addEventListener("scroll", measure, { passive: true });
		return () => {
			observer.disconnect();
			element.removeEventListener("scroll", measure);
		};
	}, []);
	const focusedIndex = accounts.findIndex((account) => account.key === focusedKey);
	const activeIndex = accounts.findIndex((account) => account.key === activeKey);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) =>
			[...new Set([...defaultRangeExtractor(range), focusedIndex, activeIndex].filter((index) => index >= 0))].sort(
				(left, right) => left - right,
			),
		[activeIndex, focusedIndex],
	);
	const virtualizer = useVirtualizer({
		count: accounts.length,
		getScrollElement: () => scroller?.element ?? null,
		estimateSize: () => 56,
		scrollMargin: scroller?.margin ?? 0,
		overscan: 8,
		enabled: scroller !== null,
		getItemKey: (index) => accounts[index]!.key,
		rangeExtractor,
	});
	const virtualRows = virtualizer.getVirtualItems();
	const drawn =
		scroller === null ? accounts.slice(0, 16).map((_account, index) => index) : virtualRows.map((row) => row.index);
	useEffect(() => {
		const request = wantsFocus.current;
		if (request === null) return;
		const index = accounts.findIndex((account) => account.key === request.key);
		if (index === -1) {
			wantsFocus.current = null;
			return;
		}
		const row = [...list.current!.querySelectorAll<HTMLElement>("[data-usage-account]")].find(
			(item) => item.dataset.usageAccount === request.key,
		);
		if (row === undefined) {
			virtualizer.scrollToIndex(index, { align: "auto" });
			return;
		}
		const controls = controlsOf(row);
		(request.back ? controls[controls.length - 1]! : controls[0]!).focus({ preventScroll: true });
		wantsFocus.current = null;
	});
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Tab") return;
		const row = (event.target as HTMLElement).closest<HTMLElement>("[data-usage-account]");
		if (row === null) return;
		const controls = controlsOf(row);
		if (event.target !== (event.shiftKey ? controls[0] : controls[controls.length - 1])) return;
		const current = accounts.findIndex((account) => account.key === row.dataset.usageAccount);
		const next = current + (event.shiftKey ? -1 : 1);
		if (next < 0 || next >= accounts.length || drawn.includes(next)) return;
		event.preventDefault();
		wantsFocus.current = { key: accounts[next]!.key, back: event.shiftKey };
		virtualizer.scrollToIndex(next, { align: "auto" });
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: each measured wrapper contains the SettingsListRow list item.
		<div
			ref={list}
			role="list"
			className="status-group relative"
			style={{ height: scroller === null ? undefined : `${virtualizer.getTotalSize()}px` }}
			onKeyDown={onKeyDown}
			onFocus={(event) => {
				const row = (event.target as HTMLElement).closest<HTMLElement>("[data-usage-account]");
				if (row !== null) setFocusedKey(row.dataset.usageAccount);
			}}
		>
			{drawn.map((index) => {
				const account = accounts[index]!;
				const virtual = virtualRows.find((row) => row.index === index);
				return (
					<div
						key={account.key}
						ref={virtual ? virtualizer.measureElement : undefined}
						data-index={index}
						data-usage-account={account.key}
						role="presentation"
						className={scroller === null ? undefined : "absolute inset-x-0"}
						style={
							virtual ? { transform: `translateY(${virtual.start - virtualizer.options.scrollMargin}px)` } : undefined
						}
					>
						{renderRow(account, (active) => setActiveKey(active ? account.key : undefined))}
					</div>
				);
			})}
		</div>
	);
}
