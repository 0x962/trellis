import { Select as BaseSelect } from "@base-ui/react/select";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { popupMotion } from "../../utils/popupMotion";

export type SelectItem<Value extends string> = {
	value: Value;
	label: string;
	// A mark before the label, such as a color swatch. It shows in the list and,
	// for the chosen item, in the trigger. It keeps its own size.
	icon?: ReactNode;
};

export type SelectProps<Value extends string> = {
	// The accessible name of the trigger.
	label: string;
	// The id of the trigger. A `Field` passes it, so its `<label htmlFor>`
	// reaches the trigger.
	id?: string;
	placeholder?: string;
	items: readonly SelectItem<Value>[];
	value: Value;
	onValueChange: (value: Value) => void;
	disabled?: boolean;
	alignItemWithTrigger?: boolean;
	className?: string;
};

// A single-value picker. The trigger is a 28 px combobox at least 96 px wide;
// the hit-area layer reaches the 44 px minimum on a coarse pointer. The list
// opens under it and follows the arrow keys.
export function Select<Value extends string>({
	label,
	id,
	placeholder,
	items,
	value,
	onValueChange,
	disabled = false,
	alignItemWithTrigger = true,
	className,
}: SelectProps<Value>) {
	const chosenIcon = items.find((item) => item.value === value)?.icon;
	return (
		<BaseSelect.Root
			items={items}
			value={value === "" ? null : value}
			onValueChange={(next) => onValueChange(next as Value)}
			disabled={disabled}
		>
			<BaseSelect.Trigger
				id={id}
				aria-label={label}
				aria-disabled={disabled || undefined}
				className={cx(
					"inline-flex h-7 min-w-24 shrink-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-control pr-1.5 pl-2 text-sm text-fg whitespace-nowrap select-none transition duration-hover ease-out",
					hitArea.box28Bordered,
					"hover:bg-control-hover active:bg-control-active data-popup-open:bg-control-active",
					"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
					"disabled:bg-surface disabled:border-border disabled:text-fg-faint disabled:pointer-events-none",
					className,
				)}
			>
				{chosenIcon === undefined ? (
					<BaseSelect.Value placeholder={placeholder} className="min-w-0 truncate" />
				) : (
					<span className="flex min-w-0 items-center gap-1.5">
						<span aria-hidden="true" className="inline-flex shrink-0 items-center">
							{chosenIcon}
						</span>
						<BaseSelect.Value placeholder={placeholder} className="min-w-0 truncate" />
					</span>
				)}
				<BaseSelect.Icon className="inline-flex size-3.5 shrink-0 text-fg-faint *:size-full">
					<CaretDown />
				</BaseSelect.Icon>
			</BaseSelect.Trigger>
			<BaseSelect.Portal>
				<BaseSelect.Positioner
					alignItemWithTrigger={alignItemWithTrigger}
					sideOffset={4}
					className="z-50 outline-none select-none"
				>
					<BaseSelect.Popup
						className={cx(
							"min-w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
							popupMotion,
							"duration-popover",
						)}
					>
						<BaseSelect.List className="max-h-(--available-height) overflow-y-auto">
							{items.map((item) => (
								<BaseSelect.Item
									key={item.value}
									value={item.value}
									className="grid h-7 grid-cols-[1rem_1fr] items-center gap-1.5 rounded-sm pr-3 pl-1.5 text-sm text-fg outline-none select-none data-highlighted:bg-bg"
								>
									<BaseSelect.ItemIndicator className="col-start-1 inline-flex size-3.5 text-fg-muted *:size-full">
										<Check />
									</BaseSelect.ItemIndicator>
									{item.icon === undefined ? (
										<BaseSelect.ItemText className="col-start-2 truncate">{item.label}</BaseSelect.ItemText>
									) : (
										<span className="col-start-2 flex min-w-0 items-center gap-1.5">
											<span aria-hidden="true" className="inline-flex shrink-0 items-center">
												{item.icon}
											</span>
											<BaseSelect.ItemText className="min-w-0 truncate">{item.label}</BaseSelect.ItemText>
										</span>
									)}
								</BaseSelect.Item>
							))}
						</BaseSelect.List>
					</BaseSelect.Popup>
				</BaseSelect.Positioner>
			</BaseSelect.Portal>
		</BaseSelect.Root>
	);
}
