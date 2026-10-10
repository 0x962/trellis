import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { EpicNameSchema } from "@trellis/api";
import { Command, Kbd, Popover } from "@trellis/ui";
import { useMemo, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { epicSplat, projectHref } from "../../../lib/projectUrl";
import { usePickerCreate } from "../../pickers/hooks/usePickerCreate";
import { createNameItem } from "../../pickers/utils/createNameItem";
import { TitleMenuButton } from "../../shell/PageTitle/TitleMenuButton";
import { allEpicsId, epicSwitcherItems, epicSwitchSearch } from "./epicSwitcherItems";

export const epicSwitcherPopoverClassName = "w-80 max-w-(--available-width) p-0";
export const epicSwitcherCommandClassName =
	"[&_[cmdk-item]]:h-7 max-sm:[&_[cmdk-input]]:min-w-0 max-sm:[&_[cmdk-item]]:h-auto max-sm:[&_[cmdk-item]]:min-h-7 max-sm:[&_[cmdk-item]]:py-1 max-sm:[&_[cmdk-item]>span[aria-hidden=true]]:hidden pointer-coarse:[&_[cmdk-item]]:h-auto pointer-coarse:[&_[cmdk-item]]:min-h-11 max-sm:pointer-coarse:[&_[cmdk-item]]:min-h-11";

export type EpicSwitcherProps = {
	// The path of the project the epic page is under.
	project: string;
	// The ref of the open epic, `OP/routine-runtime`.
	epicRef: string;
	name: string;
	// The tab of the open epic. The epic a person switches to opens on it.
	tab: "overview" | "resources";
	className?: string;
	wrap?: boolean;
};

// The epic name in the top bar, as a button that opens a search of the
// other epics of the project. The caret is always drawn, so the name
// reads as a control before the pointer reaches it. A pick opens that epic
// on the same tab; the All epics row opens the Epics list. `g e` clicks the
// button through `data-epic-switcher` (see `useGlobalHotkeys`).
export function EpicSwitcher({ project, epicRef, name, tab, className, wrap = false }: EpicSwitcherProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const [open, setOwnOpen] = useState(false);
	const [search, setSearch] = useState("");
	const setOpen = (open: boolean) => {
		setOwnOpen(open);
		if (!open) {
			setSearch("");
			creation.reset();
		}
	};
	const input = useRef<HTMLInputElement>(null);
	const list = useQuery({ ...orpc.epics.list.queryOptions({ input: { project: project } }), enabled: open });
	const items = useMemo(
		() => (list.data === undefined ? [] : epicSwitcherItems(list.data, epicRef)),
		[list.data, epicRef],
	);

	const pick = (id: string) => {
		setOpen(false);
		if (id === allEpicsId) {
			void navigate({ href: projectHref(project, "epics") });
			return;
		}
		if (id === epicRef) return;
		void navigate({ to: "/p/$", params: { _splat: epicSplat(id) }, search: epicSwitchSearch(tab) });
	};

	const creation = usePickerCreate({
		scope: project,
		create: (name) => client.epics.create({ project, name }),
		invalidate: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
			]),
		onCreated: (epic) => pick(epic.ref),
	});
	const createItem = list.isSuccess
		? createNameItem(
				"epic",
				search,
				list.data.map((epic) => epic.name),
				(name) => EpicNameSchema.safeParse(name).success,
			)
		: null;
	return (
		<Popover
			label="Switch epic"
			open={open}
			onOpenChange={setOpen}
			initialFocus={input}
			className={epicSwitcherPopoverClassName}
			triggerTooltip={
				<span className="inline-flex items-center gap-1.5">
					Switch epic
					<Kbd>G</Kbd>
					<Kbd>E</Kbd>
				</span>
			}
			trigger={<TitleMenuButton data-epic-switcher="" label={name} wrap={wrap} className={className} />}
		>
			<Command
				className={epicSwitcherCommandClassName}
				inputRef={input}
				label="Search epics"
				placeholder="Switch epic"
				items={createItem ? [...items, createItem] : items}
				onSearchChange={setSearch}
				empty={list.data === undefined ? "Load epics…" : "No epics."}
				onSelect={(id) => {
					if (creation.pending) return;
					if (id === createItem?.id) creation.create(search.trim());
					else pick(id);
				}}
			/>
			{creation.error && (
				<p role="alert" className="px-3 py-2 text-sm text-danger">
					{creation.error}
				</p>
			)}
		</Popover>
	);
}
