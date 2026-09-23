import type { Label, LabelGroup } from "@trellis/api";
import { LabelEditor } from "../../../LabelEditor";
import { LabelGroupRow } from "../../../LabelGroupRow";
import { LabelRow } from "../../../LabelRow";
import type { LabelEntry } from "../../utils/labelEntries";

export type LabelListProps = {
	// The key of the project that owns the labels.
	project: string;
	// The lines to draw, in the order they stand in.
	entries: LabelEntry[];
	// Every group of the tree. A label row offers each one as a move target.
	groups: readonly LabelGroup[];
	// The group a new label joins while its form is open. The `groupId` is
	// null for a new label with no group, and the whole field is null while
	// no new-label form is open.
	creating: { groupId: string | null } | null;
	// The id of the label whose editor is open.
	editing: string | null;
	// The id of the group whose name stands as a text field.
	renamingGroupId: string | null;
	// The ids of the groups that show no label.
	collapsed: ReadonlySet<string>;
	// Takes the menu trigger of one group, so the page can give the focus
	// back to it.
	onGroupMenu: (groupId: string, node: HTMLButtonElement | null) => void;
	onChanged: () => Promise<void>;
	onToggleGroup: (groupId: string) => void;
	onEdit: (labelId: string) => void;
	onCancelEdit: () => void;
	onCloseCreate: (groupId: string | null) => void;
	onNewLabel: (groupId: string) => void;
	onRenamingChange: (group: LabelGroup, renaming: boolean) => void;
	// Sends the new name of a group. It throws when the server refuses.
	onRenameGroup: (group: LabelGroup, name: string) => Promise<void>;
	onDeleteLabel: (label: Label) => void;
	onDeleteGroup: (group: LabelGroup) => void;
};

// The card that holds the labels list. A label with no group is a row of the
// card, and a group is a heading band with its own rows under it.
export function LabelList({
	project,
	entries,
	groups,
	creating,
	editing,
	renamingGroupId,
	collapsed,
	onGroupMenu,
	onChanged,
	onToggleGroup,
	onEdit,
	onCancelEdit,
	onCloseCreate,
	onNewLabel,
	onRenamingChange,
	onRenameGroup,
	onDeleteLabel,
	onDeleteGroup,
}: LabelListProps) {
	const row = (label: Label, nested: boolean) => (
		<LabelRow
			key={label.id}
			project={project}
			label={label}
			groups={groups}
			nested={nested}
			expanded={editing === label.id}
			onChanged={onChanged}
			onEdit={() => onEdit(label.id)}
			onCancel={onCancelEdit}
			onDelete={onDeleteLabel}
		/>
	);

	const newLabel = (groupId: string | null) => (
		<li className="status-row">
			<LabelEditor
				project={project}
				label={null}
				groupId={groupId}
				onChanged={onChanged}
				onCancel={() => onCloseCreate(groupId)}
			/>
		</li>
	);

	return (
		<div className="status-group">
			<ul className="status-group-list">
				{creating?.groupId === null && newLabel(null)}
				{entries.map((entry) => {
					if (entry.kind === "label") return row(entry.label, false);
					const { group } = entry;
					const open = !collapsed.has(group.id);
					const adding = creating?.groupId === group.id;
					return (
						<LabelGroupRow
							key={group.id}
							group={group}
							labelCount={entry.labels.length}
							expanded={open}
							renaming={renamingGroupId === group.id}
							menuRef={(node) => onGroupMenu(group.id, node)}
							onToggle={() => onToggleGroup(group.id)}
							onRenamingChange={(next) => onRenamingChange(group, next)}
							onRename={(name) => onRenameGroup(group, name)}
							onNewLabel={() => onNewLabel(group.id)}
							onDelete={() => onDeleteGroup(group)}
						>
							{open && entry.labels.length === 0 && !adding && (
								<p className="label-group-empty">No label in this group.</p>
							)}
							{open && (entry.labels.length > 0 || adding) && (
								<ul className="label-group-list">
									{entry.labels.map((label) => row(label, true))}
									{adding && newLabel(group.id)}
								</ul>
							)}
						</LabelGroupRow>
					);
				})}
			</ul>
		</div>
	);
}
