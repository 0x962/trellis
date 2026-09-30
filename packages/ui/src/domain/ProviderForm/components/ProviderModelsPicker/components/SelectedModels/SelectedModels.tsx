import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualRows } from "../../../../../../hooks/useVirtualRows";
import { Chip } from "../../../../../../primitives/Chip";

type Props = { value: string[]; disabled?: boolean; onRemove: (model: string) => void };
const rowHeight = 44;

export function SelectedModels({ value, disabled, onRemove }: Props) {
	const viewport = useRef<HTMLElement>(null);
	const sizes = useMemo(() => value.map(() => rowHeight), [value]);
	const rows = useVirtualRows(viewport, sizes, 2);
	const [focused, setFocused] = useState<string>();
	const [focusIndex, setFocusIndex] = useState<number>();
	const focusedIndex = focused === undefined ? -1 : value.indexOf(focused);
	const indexes = Array.from({ length: Math.max(0, rows.end - rows.start) }, (_, i) => rows.start + i);
	if (focusedIndex >= 0 && !indexes.includes(focusedIndex)) indexes.push(focusedIndex);
	const target = focusIndex === undefined ? undefined : Math.min(focusIndex, value.length - 1);
	if (target !== undefined && target >= 0 && !indexes.includes(target)) indexes.push(target);
	useLayoutEffect(() => {
		if (target === undefined) return;
		rows.scrollToIndex(target);
		viewport
			.current!.querySelector<HTMLButtonElement>(`[data-model-index="${target}"] button`)
			?.focus({ preventScroll: true });
		setFocusIndex(undefined);
	}, [target, rows.scrollToIndex]);
	return (
		<section
			ref={viewport}
			aria-label="Selected models"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region needs keyboard focus to reach models outside the viewport.
			tabIndex={0}
			className="max-h-66 overflow-y-auto focus-visible:outline-2 focus-visible:outline-accent"
			onFocusCapture={(event) => {
				const row = (event.target as HTMLElement).closest<HTMLElement>("[data-model-index]");
				if (row) setFocused(value[Number(row.dataset.modelIndex)]);
			}}
			onKeyDown={(event) => {
				const positions: Record<string, number> = {
					ArrowDown: Math.min(value.length - 1, Math.max(0, focusedIndex + 1)),
					ArrowUp: Math.max(0, focusedIndex - 1),
					Home: 0,
					End: value.length - 1,
					PageDown: Math.min(value.length - 1, Math.max(0, focusedIndex + 6)),
					PageUp: Math.max(0, focusedIndex - 6),
				};
				if (positions[event.key] !== undefined && !disabled) {
					event.preventDefault();
					setFocusIndex(positions[event.key]);
				}
			}}
		>
			<div className="relative" style={{ height: value.length * rowHeight }}>
				{indexes.map((index) => (
					<div
						key={value[index]}
						data-model-index={index}
						className="absolute flex w-full items-center"
						style={{ top: index * rowHeight, height: rowHeight }}
					>
						<Chip
							label=""
							op=""
							value={value[index]!}
							removeLabel={`Remove ${value[index]}`}
							onRemove={
								disabled
									? undefined
									: () => {
											setFocusIndex(index);
											onRemove(value[index]!);
										}
							}
							className="max-w-full [&>span]:truncate"
						/>
					</div>
				))}
			</div>
		</section>
	);
}
