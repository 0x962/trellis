import { CaretDown, CaretRight, DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { LabelGroup } from "@trellis/api";
import { IconButton, InlineEdit, Menu, type MenuItem } from "@trellis/ui";
import { type ReactNode, type Ref, useId } from "react";
import { formatCount } from "../../../lib/format";

export type LabelGroupRowProps = {
	group: LabelGroup;
	// The number of labels the group shows, after the search text applies.
	labelCount: number;
	expanded: boolean;
	// True draws the name of the group as a text field.
	renaming: boolean;
	// Takes the menu trigger of this group. The page returns the focus to it
	// when a form that the menu opened closes.
	menuRef: Ref<HTMLButtonElement>;
	onToggle: () => void;
	onRenamingChange: (renaming: boolean) => void;
	// Sends the new name. It throws when the server refuses, so the field
	// stays open and prints the reason.
	onRename: (name: string) => Promise<void>;
	onNewLabel: () => void;
	onDelete: () => void;
	// The rows of the labels of this group, and the forms the group opens.
	children: ReactNode;
};

// One group of the settings list: a heading band with a chevron, the group
// name, the number of labels, and the actions. The labels of the group stand
// under the band while the group is open. Rename opens the name as a text
// field over the whole band, so no click on the band opens or shuts the group
// while the field is open.
export function LabelGroupRow({
	group,
	labelCount,
	expanded,
	renaming,
	menuRef,
	onToggle,
	onRenamingChange,
	onRename,
	onNewLabel,
	onDelete,
	children,
}: LabelGroupRowProps) {
	const listId = useId();
	const actions = `Actions for ${group.name}`;
	const items: MenuItem[] = [
		{ label: "Rename", icon: <PencilSimple />, onSelect: () => onRenamingChange(true) },
		{ label: "New label in group", icon: <Plus />, onSelect: onNewLabel },
		{ label: "Delete", icon: <Trash />, danger: true, onSelect: onDelete },
	];

	return (
		<li className="status-row">
			<div className="label-group-heading">
				<InlineEdit
					label={`Name of ${group.name}`}
					value={group.name}
					editing={renaming}
					onEditingChange={onRenamingChange}
					onSave={onRename}
					errorTitle={`${group.name} is not renamed.`}
					className="min-w-0 flex-1"
					inputClassName="h-7"
				>
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
				</InlineEdit>
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
