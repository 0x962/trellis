import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { BaseUIEvent } from "@base-ui/react/types";
import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type TabItem<Value extends string> = {
	value: Value;
	label: string;
	// Text the tab adds to its accessible name only, such as "Working". The
	// tab shows the label and the icon, never this word.
	accessibleStatus?: string;
	icon?: ReactNode;
	content: ReactNode;
	disabled?: boolean;
};

export type TabsProps<Value extends string> = {
	items: readonly TabItem<Value>[];
	value: Value;
	onValueChange: (value: Value) => void;
	className?: string;
};

// The tab an arrow key lands on, among the enabled tabs only. Base UI moves
// focus onto a disabled tab and leaves it unselected. A disabled tab cannot
// be selected, so the keys pass over it and wrap at both ends.
const step = <Value extends string>(items: readonly TabItem<Value>[], value: Value, key: string) => {
	const enabled = items.filter((item) => !item.disabled);
	const index = enabled.findIndex((item) => item.value === value);
	const moves: Record<string, number | undefined> = {
		ArrowRight: (index + 1) % enabled.length,
		ArrowLeft: (index - 1 + enabled.length) % enabled.length,
		Home: 0,
		End: enabled.length - 1,
	};
	const next = moves[key];
	return next === undefined ? undefined : enabled[next];
};

// Underlined tabs over one panel. Arrow keys, Home, and End move the
// selection and skip a disabled tab. The panel is a keyboard stop (Base UI
// renders it with tabindex="0"), so it draws the focus ring like a control.
// A tab hugs its label, so the underline is as wide as the text. The
// hit-area layer is centered on the tab with a minimum size of its own. A
// short label still gives a 28 px hit box, and 44 px on a coarse pointer.
export function Tabs<Value extends string>({ items, value, onValueChange, className }: TabsProps<Value>) {
	const onKeyDown = (event: BaseUIEvent<KeyboardEvent<HTMLDivElement>>) => {
		const next = step(items, value, event.key);
		if (!next) return;
		event.preventDefault();
		event.preventBaseUIHandler();
		onValueChange(next.value);
		const tabs = event.currentTarget.querySelectorAll<HTMLElement>("[role=tab]");
		tabs[items.indexOf(next)]?.focus();
	};
	return (
		<BaseTabs.Root value={value} onValueChange={(next) => onValueChange(next as Value)} className={className}>
			<BaseTabs.List onKeyDown={onKeyDown} className="flex min-w-0 gap-4 overflow-x-auto border-b border-border">
				{items.map((item) => (
					<BaseTabs.Tab
						key={item.value}
						value={item.value}
						aria-label={item.accessibleStatus ? `${item.label}, ${item.accessibleStatus}` : item.label}
						disabled={item.disabled}
						className={(state) =>
							cx(
								"-mb-px flex h-8 items-center gap-1.5 border-b-2 px-0.5 text-sm font-medium whitespace-nowrap select-none transition-colors duration-hover ease-out",
								hitArea.tab32,
								"focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 focus-visible:rounded-sm",
								state.active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
								state.disabled && "opacity-50",
							)
						}
					>
						{item.icon !== undefined && <span aria-hidden="true">{item.icon}</span>}
						{item.label}
					</BaseTabs.Tab>
				))}
			</BaseTabs.List>
			{items.map((item) => (
				<BaseTabs.Panel
					key={item.value}
					value={item.value}
					className="pt-3 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				>
					{item.content}
				</BaseTabs.Panel>
			))}
		</BaseTabs.Root>
	);
}
