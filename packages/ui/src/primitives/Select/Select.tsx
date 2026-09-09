import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "../../utils/cx";
import { popupMotion } from "../../utils/popupMotion";

export type SelectItem<Value extends string> = {
	value: Value;
	label: string;
};

export type SelectProps<Value extends string> = {
	// The accessible name of the trigger.
	label: string;
	items: readonly SelectItem<Value>[];
	value: Value;
	onValueChange: (value: Value) => void;
	disabled?: boolean;
	className?: string;
};

// A single-value picker. The trigger is a 28 px combobox; the list opens
// under it and follows the arrow keys.
export function Select<Value extends string>({
	label,
	items,
	value,
	onValueChange,
	disabled = false,
	className,
}: SelectProps<Value>) {
	return (
		<BaseSelect.Root
			items={items}
			value={value}
			onValueChange={(next) => onValueChange(next as Value)}
			disabled={disabled}
		>
			<BaseSelect.Trigger
				aria-label={label}
				aria-disabled={disabled || undefined}
				className={cx(
					"inline-flex h-7 min-w-24 shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-surface pr-1.5 pl-2 text-sm text-fg whitespace-nowrap select-none transition duration-hover ease-out",
					"hover:bg-bg hover:border-border-strong data-popup-open:bg-bg",
					"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
					"disabled:opacity-50 disabled:pointer-events-none",
					className,
				)}
			>
				<BaseSelect.Value />
				<BaseSelect.Icon className="inline-flex size-3.5 text-fg-faint *:size-full">
					<ChevronDown />
				</BaseSelect.Icon>
			</BaseSelect.Trigger>
			<BaseSelect.Portal>
				<BaseSelect.Positioner sideOffset={4} className="z-50 outline-none select-none">
					<BaseSelect.Popup
						className={cx(
							"min-w-(--anchor-width) origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
							popupMotion,
							"duration-popover",
						)}
					>
						<BaseSelect.List className="max-h-(--available-height) overflow-y-auto">
							{items.map((item) => (
								<BaseSelect.Item
									key={item.value}
									value={item.value}
									className="grid h-7 cursor-default grid-cols-[1rem_1fr] items-center gap-1.5 rounded-sm pr-3 pl-1.5 text-sm text-fg outline-none select-none data-highlighted:bg-bg"
								>
									<BaseSelect.ItemIndicator className="col-start-1 inline-flex size-3.5 text-fg-muted *:size-full">
										<Check />
									</BaseSelect.ItemIndicator>
									<BaseSelect.ItemText className="col-start-2">{item.label}</BaseSelect.ItemText>
								</BaseSelect.Item>
							))}
						</BaseSelect.List>
					</BaseSelect.Popup>
				</BaseSelect.Positioner>
			</BaseSelect.Portal>
		</BaseSelect.Root>
	);
}
