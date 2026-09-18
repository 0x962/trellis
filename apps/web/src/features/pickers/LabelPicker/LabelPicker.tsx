import type { Label } from "@trellis/api";
import { Command, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { useLabels } from "../hooks/useLabels";
import { pickerListClass } from "../pickerListClass";
import { isCreateRow, labelRows } from "../utils/labelRows";

export type LabelPickerProps = {
	// A project path. The picker reads the labels of its root through useLabels.
	project: string;
	// The ids of the labels drawn as checked. A bulk picker puts a label here
	// when every ticket it writes to holds that label.
	checked: readonly string[];
	// The ids of the labels drawn as mixed, with a minus in place of the
	// check. A bulk picker puts a label here when some, but not all, of the
	// tickets it writes to hold that label. A pick on a mixed row sends
	// `checked` true, so the label lands on every ticket.
	mixed?: readonly string[];
	// `checked` is the new state of that row.
	onToggle: (label: Label, checked: boolean) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	// The element that takes focus when the picker closes.
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The label popover: the labels with no group, then one section per label
// group. A ticket takes several labels, so a pick toggles its row and leaves
// the popover open. Escape closes it. Text that names no label grows a row
// that creates the label and puts it on the ticket.
export function LabelPicker({
	project,
	checked,
	mixed,
	onToggle,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
}: LabelPickerProps) {
	const { client, orpc, queryClient } = useApp();
	const [own, setOwn] = useState(false);
	const [search, setSearch] = useState("");
	const [error, setError] = useState<string | null>(null);
	// The search field holds its own text inside `Command`. A new key builds a
	// new field, which is how a create empties the text it just used.
	const [fieldKey, setFieldKey] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	const { labels, groups } = useLabels(project);
	const isOpen = open ?? own;
	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
		if (!next) {
			setSearch("");
			setError(null);
		}
	};
	const create = async (name: string) => {
		setError(null);
		const created = await client.labels.create({ project, name });
		await queryClient.invalidateQueries({ queryKey: orpc.labels.list.key() });
		setSearch("");
		setFieldKey((key) => key + 1);
		onToggle(created, true);
		// The new field mounts without focus, so the next keystroke must find it.
		requestAnimationFrame(() => input.current?.focus());
	};
	const select = (id: string) => {
		if (isCreateRow(id)) {
			void create(search.trim()).catch((failure: unknown) => setError(errorMessage(failure)));
			return;
		}
		const label = labels.find((candidate) => candidate.id === id)!;
		onToggle(label, !checked.includes(label.id));
	};
	const rows = labelRows(labels, groups, { checked, mixed, search });
	return (
		<Popover
			trigger={trigger}
			label="Labels"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-64 p-0"
		>
			<Command
				key={fieldKey}
				inputRef={input}
				label="Search labels"
				placeholder="Set labels"
				items={rows.items}
				groups={rows.groups}
				empty={labels.length === 0 ? "No labels. Type a name to create one." : "No results."}
				listClassName={pickerListClass}
				onSearchChange={setSearch}
				onSelect={select}
			/>
			{error !== null && (
				<p role="alert" className="m-1 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
					{error}
				</p>
			)}
		</Popover>
	);
}
