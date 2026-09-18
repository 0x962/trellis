import { CaretDown, CaretRight, DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { LabelGroup } from "@trellis/api";
import { IconButton, Menu, type MenuItem } from "@trellis/ui";
import { type ReactNode, type Ref, useId } from "react";
import { formatCount } from "../../../lib/format";

export type LabelGroupRowProps = {
	group: LabelGroup;
	// The number of labels the group shows, after the search text applies.
	labelCount: number;
	expanded: boolean;
	// Takes the menu trigger of this group. The page returns the focus to it
	// when a form that the menu opened closes.
	menuRef: Ref<HTMLButtonElement>;
	onToggle: () => void;
	onRename: () => void;
	onNewLabel: () => void;
	onDelete: () => void;
	// The rows of the labels of this group, and the forms the group opens.
	children: ReactNode;
};

// One group of the settings list: a heading band with a chevron, the group
// name, the number of labels, and the actions. The labels of the group stand
// under the band while the group is open.
export function LabelGroupRow({
	group,
	labelCount,
	expanded,
	menuRef,
	onToggle,
	onRename,
	onNewLabel,
	onDelete,
	children,
}: LabelGroupRowProps) {
	const listId = useId();
	const actions = `Actions for ${group.name}`;
	const items: MenuItem[] = [
		{ label: "Rename", icon: <PencilSimple />, onSelect: onRename },
		{ label: "New label in group", icon: <Plus />, onSelect: onNewLabel },
		{ label: "Delete", icon: <Trash />, danger: true, onSelect: onDelete },
	];

	return (
		<li className="status-row">
			<div className="label-group-heading">
				<button
					type="button"
					className="label-group-toggle"
					aria-expanded={expanded}
					aria-controls={listId}
					onClick={onToggle}
				>
					<span aria-hidden="true" className="label-group-caret">
						{expanded ? <CaretDown /> : <CaretRight />}
					</span>
					<span className="label-group-name">{group.name}</span>
					<span className="label-group-count">{formatCount(labelCount)}</span>
				</button>
				<Menu
					label={actions}
					triggerTooltip={actions}
					items={items}
					trigger={<IconButton ref={menuRef} label={actions} icon={<DotsThree />} />}
				/>
			</div>
			<div id={listId}>{children}</div>
		</li>
	);
}
