import { Combobox } from "@base-ui/react/combobox";
import { CaretDown, Check } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import { cx } from "../../../../utils/cx";
import { hitArea } from "../../../../utils/hitArea";
import { popupMotion } from "../../../../utils/popupMotion";
import { Field } from "../../../Field";
import type { SelectProps } from "../../Select";

export function VirtualSelect<Value extends string>({
	label,
	hideLabel = true,
	hint,
	error,
	readOnly,
	readOnlyReason,
	trailingAction,
	id,
	placeholder,
	items,
	value,
	onValueChange,
	disabled = false,
	className,
}: SelectProps<Value>) {
	const coarse = useMediaQuery("(pointer: coarse)");
	const rowHeight = coarse ? 44 : 28;
	const list = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);
	const [viewport, setViewport] = useState({ top: 0, height: 280 });
	const values = useMemo(() => items.map((item) => item.value), [items]);
	const byValue = useMemo(() => new Map(items.map((item) => [item.value, item])), [items]);
	const chosen = byValue.get(value);
	const reveal = useCallback(
		(index: number) => {
			const element = list.current;
			if (element === null || index < 0) return;
			const top = index * rowHeight;
			if (top < element.scrollTop) element.scrollTop = top;
			else if (top + rowHeight > element.scrollTop + element.clientHeight)
				element.scrollTop = top + rowHeight - element.clientHeight;
			setViewport({ top: element.scrollTop, height: element.clientHeight });
		},
		[rowHeight],
	);
	useEffect(() => {
		if (!open) return;
		const element = list.current!;
		const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
		reveal(values.indexOf(value));
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [open, reveal, value, values]);
	const start = Math.max(0, Math.floor(viewport.top / rowHeight) - 2);
	const end = Math.min(items.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + 2);
	return (
		<Combobox.Root
			items={values}
			value={value === "" ? null : value}
			onValueChange={(next) => next !== null && onValueChange(next)}
			itemToStringLabel={(item) => byValue.get(item)!.label}
			filter={null}
			virtualized
			open={open}
			onOpenChange={setOpen}
			onItemHighlighted={(_item, details) => {
				if (details.reason !== "pointer") reveal(details.index);
			}}
			disabled={disabled || readOnly}
		>
			<Field
				label={label}
				id={id}
				hideLabel={hideLabel}
				hint={hint}
				error={error}
				readOnly={readOnly}
				readOnlyReason={readOnlyReason}
				trailingAction={trailingAction}
				disabled={disabled || readOnly}
			>
				<Combobox.Trigger
					id={id}
					aria-label={label}
					aria-disabled={disabled || undefined}
					className={cx(
						"inline-flex h-7 min-w-24 shrink-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-control pr-1.5 pl-2 text-sm text-fg whitespace-nowrap select-none transition duration-hover ease-out",
						hitArea.box28Bordered,
						"hover:bg-control-hover active:bg-control-active data-popup-open:bg-control-active",
						"aria-invalid:border-danger pointer-coarse:h-11 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
						"disabled:bg-surface disabled:border-border disabled:text-fg-faint disabled:pointer-events-none",
						className,
					)}
				>
					{chosen?.icon && <span aria-hidden="true">{chosen.icon}</span>}
					<span className="min-w-0 truncate">{chosen?.label ?? placeholder}</span>
					<CaretDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-faint" />
				</Combobox.Trigger>
			</Field>
			<Combobox.Portal>
				<Combobox.Positioner sideOffset={4} className="z-50 outline-none select-none">
					<Combobox.Popup
						className={cx(
							"min-w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
							popupMotion,
							"duration-popover",
						)}
					>
						<Combobox.List
							ref={list}
							className="max-h-(--available-height) overflow-y-auto"
							style={{ height: Math.min(items.length, 10) * rowHeight }}
							onScroll={(event) =>
								setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })
							}
						>
							<div role="presentation" style={{ height: items.length * rowHeight, position: "relative" }}>
								{items.slice(start, end).map((item, offset) => (
									<Combobox.Item
										key={item.value}
										value={item.value}
										index={start + offset}
										aria-setsize={items.length}
										aria-posinset={start + offset + 1}
										style={{
											position: "absolute",
											top: (start + offset) * rowHeight,
											height: rowHeight,
											width: "100%",
										}}
										className="grid grid-cols-[1rem_1fr] items-center gap-1.5 rounded-sm pr-3 pl-1.5 text-sm text-fg outline-none select-none data-highlighted:bg-bg"
									>
										<Combobox.ItemIndicator className="col-start-1 inline-flex size-3.5 text-fg-muted *:size-full">
											<Check />
										</Combobox.ItemIndicator>
										<span className="col-start-2 flex min-w-0 items-center gap-1.5">
											{item.icon && <span aria-hidden="true">{item.icon}</span>}
											<span className="truncate">{item.label}</span>
										</span>
									</Combobox.Item>
								))}
							</div>
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);
}
