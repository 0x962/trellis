import { CaretDown } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Popover } from "../../../../primitives/Popover";
import type { PageTabItem } from "../../PageTabs";
import { TabPickerContent } from "./components/TabPickerContent";

type Props = { tabs: readonly PageTabItem[]; activeId: string; onSelect: (id: string) => void };
export function TabPicker({ tabs, activeId, onSelect }: Props) {
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	return (
		<Popover
			label="All open tabs"
			align="end"
			open={open}
			initialFocus={input}
			onOpenChange={setOpen}
			triggerTooltip={`Search ${tabs.length} open tabs`}
			trigger={<IconButton label="Search open tabs" icon={<CaretDown />} className="max-sm:h-11 max-sm:min-w-11" />}
			className="w-80 max-w-[calc(100vw-16px)] p-2"
		>
			{open && (
				<TabPickerContent
					tabs={tabs}
					activeId={activeId}
					inputRef={input}
					onSelect={(id) => {
						onSelect(id);
						setOpen(false);
					}}
				/>
			)}
		</Popover>
	);
}
