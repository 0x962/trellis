import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Provider } from "@trellis/api";
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

export function VirtualUsageProviderRows({
	providers,
	renderRow,
}: {
	providers: readonly Provider[];
	renderRow: (provider: Provider, onActiveChange: (active: boolean) => void) => ReactNode;
}) {
	const list = useRef<HTMLDivElement>(null);
	const [scroller, setScroller] = useState<{ element: HTMLElement; margin: number } | null>(null);
	const [focusedId, setFocusedId] = useState<string>();
	const [activeId, setActiveId] = useState<string>();
	const wantsFocus = useRef<{ id: string; back: boolean } | null>(null);
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
	const focusedIndex = providers.findIndex((provider) => provider.id === focusedId);
	const activeIndex = providers.findIndex((provider) => provider.id === activeId);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) =>
			[...new Set([...defaultRangeExtractor(range), focusedIndex, activeIndex].filter((index) => index >= 0))].sort(
				(left, right) => left - right,
			),
		[activeIndex, focusedIndex],
	);
	const virtualizer = useVirtualizer({
		count: providers.length,
		getScrollElement: () => scroller?.element ?? null,
		estimateSize: () => 56,
		scrollMargin: scroller?.margin ?? 0,
		overscan: 8,
		enabled: scroller !== null,
		getItemKey: (index) => providers[index]!.id,
		rangeExtractor,
	});
	const virtualRows = virtualizer.getVirtualItems();
	const drawn =
		scroller === null ? providers.slice(0, 16).map((_provider, index) => index) : virtualRows.map((row) => row.index);
	useEffect(() => {
		const request = wantsFocus.current;
		if (request === null) return;
		const index = providers.findIndex((provider) => provider.id === request.id);
		if (index === -1) {
			wantsFocus.current = null;
			return;
		}
		const row = [...list.current!.querySelectorAll<HTMLElement>("[data-usage-provider]")].find(
			(item) => item.dataset.usageProvider === request.id,
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
		const row = (event.target as HTMLElement).closest<HTMLElement>("[data-usage-provider]");
		if (row === null) return;
		const controls = controlsOf(row);
		if (event.target !== (event.shiftKey ? controls[0] : controls[controls.length - 1])) return;
		const current = providers.findIndex((provider) => provider.id === row.dataset.usageProvider);
		const next = current + (event.shiftKey ? -1 : 1);
		if (next < 0 || next >= providers.length || drawn.includes(next)) return;
		event.preventDefault();
		wantsFocus.current = { id: providers[next]!.id, back: event.shiftKey };
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
				const row = (event.target as HTMLElement).closest<HTMLElement>("[data-usage-provider]");
				if (row !== null) setFocusedId(row.dataset.usageProvider);
			}}
		>
			{drawn.map((index) => {
				const provider = providers[index]!;
				const virtual = virtualRows.find((row) => row.index === index);
				return (
					<div
						key={provider.id}
						ref={virtual ? virtualizer.measureElement : undefined}
						data-index={index}
						data-usage-provider={provider.id}
						role="presentation"
						className={scroller === null ? undefined : "absolute inset-x-0"}
						style={
							virtual ? { transform: `translateY(${virtual.start - virtualizer.options.scrollMargin}px)` } : undefined
						}
					>
						{renderRow(provider, (active) => setActiveId(active ? provider.id : undefined))}
					</div>
				);
			})}
		</div>
	);
}
