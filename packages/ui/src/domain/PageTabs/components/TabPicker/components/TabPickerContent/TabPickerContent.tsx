import { type RefObject, useMemo } from "react";
import { Command } from "../../../../../../primitives/Command";
import type { PageTabItem } from "../../../../PageTabs";

type Props = {
	tabs: readonly PageTabItem[];
	activeId: string;
	onSelect: (id: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
};

export function TabPickerContent({ tabs, activeId, onSelect, inputRef }: Props) {
	const items = useMemo(
		() => tabs.map((tab) => ({ id: tab.id, label: tab.title, current: tab.id === activeId })),
		[tabs, activeId],
	);
	return (
		<Command.Virtual
			items={items}
			onSelect={onSelect}
			inputRef={inputRef}
			label="Search open tabs"
			placeholder="Search open tabs…"
			empty="No tabs match."
		/>
	);
}
