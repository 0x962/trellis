import { ListBullets } from "@phosphor-icons/react";
import type { EpicSummary } from "@trellis/api";
import type { CommandItem } from "@trellis/ui";
import { formatCount } from "../../../lib/format";
import { epicItems } from "../../pickers/EpicPicker";
import { epicProgress } from "../epicBar";

// The id of the last row, which opens the Epics list. An epic ref always
// holds a slash, so no epic takes this id.
export const allEpicsId = "all-epics";

export const epicSwitcherItems = (epics: readonly EpicSummary[], current: string): CommandItem[] => {
	const openEpics = epics.filter((epic) => epic.state === "open");
	return [
		...epicItems(openEpics, { current, picker: true }).map((item, index) => {
			const epic = openEpics[index]!;
			const { done, of } = epicProgress(epic.counts);
			return {
				...item,
				children: (
					<span className="sr-only">
						, {formatCount(done)} of {formatCount(of)} tickets done
					</span>
				),
				hint: `${formatCount(done)}/${formatCount(of)} done`,
			};
		}),
		{ id: allEpicsId, label: "All epics", icon: <ListBullets className="text-fg-muted" /> },
	];
};

// The search of the epic a person switches to. The tab stays; the filters,
// the grouping and the rest of the table view belong to the epic that was
// open, so they drop.
export const epicSwitchSearch = (tab: "overview" | "resources") => (tab === "resources" ? { tab } : {});
