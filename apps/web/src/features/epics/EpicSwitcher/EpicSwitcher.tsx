import { CaretDown } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command, Kbd, Popover } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { epicSplat, projectHref, rootKey } from "../../../lib/projectPath";
import { allEpicsId, epicSwitcherItems, epicSwitchSearch } from "./epicSwitcherItems";

export type EpicSwitcherProps = {
	// The path of the project the epic page is under.
	project: string;
	// The ref of the open epic, `OP/routine-runtime`.
	epicRef: string;
	name: string;
	// The tab of the open epic. The epic a person switches to opens on it.
	tab: "overview" | "resources";
};

// The epic name in the top bar, as a button that opens a search of the
// other epics of the root project. The caret is always drawn, so the name
// reads as a control before the pointer reaches it. A pick opens that epic
// on the same tab; the All epics row opens the Epics list. `g e` clicks the
// button through `data-epic-switcher` (see `useGlobalHotkeys`).
export function EpicSwitcher({ project, epicRef, name, tab }: EpicSwitcherProps) {
	const { orpc } = useApp();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const list = useQuery({ ...orpc.epics.list.queryOptions({ input: { project: rootKey(project) } }), enabled: open });

	const pick = (id: string) => {
		setOpen(false);
		if (id === allEpicsId) {
			void navigate({ href: projectHref(project, "epics") });
			return;
		}
		if (id === epicRef) return;
		void navigate({ to: "/p/$", params: { _splat: epicSplat(id) }, search: epicSwitchSearch(tab) });
	};

	return (
		<Popover
			label="Switch epic"
			open={open}
			onOpenChange={setOpen}
			initialFocus={input}
			className="w-80 p-0"
			triggerTooltip={
				<span className="inline-flex items-center gap-1.5">
					Switch epic
					<Kbd>G</Kbd>
					<Kbd>E</Kbd>
				</span>
			}
			trigger={
				<button
					type="button"
					data-epic-switcher=""
					className="flex h-7 max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 data-[popup-open]:bg-band max-md:h-11 pointer-coarse:h-11"
				>
					<span className="min-w-0 truncate">{name}</span>
					<CaretDown aria-hidden="true" weight="bold" className="size-4 shrink-0 text-fg" />
				</button>
			}
		>
			<Command
				inputRef={input}
				label="Search epics"
				placeholder="Switch epic"
				items={list.data === undefined ? [] : epicSwitcherItems(list.data, epicRef)}
				empty={list.data === undefined ? "Load epics…" : "No epics."}
				onSelect={pick}
			/>
		</Popover>
	);
}
