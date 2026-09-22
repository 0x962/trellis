import { ListBullets } from "@phosphor-icons/react";
import type { EpicSummary } from "@trellis/api";
import type { CommandItem } from "@trellis/ui";
import { epicItems } from "../../pickers/EpicPicker";
import { progressIcon } from "../../progressIcon";
import { epicProgress } from "../epicBar";

// The id of the last row, which opens the Epics list. An epic ref always
// holds a slash, so no epic takes this id.
export const allEpicsId = "all-epics";

// The rows of the epic switcher: every epic of `epics.list`, open first,
// each with its progress circle and a check on the current epic, then the
// All epics row.
export const epicSwitcherItems = (epics: readonly EpicSummary[], current: string): CommandItem[] => [
	...epicItems(epics, { current, picker: true }).map((item, index) => {
		const epic = epics[index]!;
		const { done, of } = epicProgress(epic.counts);
		return { ...item, icon: progressIcon(done, of, epic.state === "done") };
	}),
	{ id: allEpicsId, label: "All epics", icon: <ListBullets className="text-fg-muted" /> },
];

// The search of the epic a person switches to. The tab stays; the filters,
// the grouping and the rest of the table view belong to the epic that was
// open, so they drop.
export const epicSwitchSearch = (tab: "overview" | "resources") => (tab === "resources" ? { tab } : {});
