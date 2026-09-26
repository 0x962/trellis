import { DotsThree, FolderSimple, PencilSimple, Trash } from "@phosphor-icons/react";
import type { Label, LabelGroup } from "@trellis/api";
import { FormStatus, IconButton, LabelDot, Menu, type MenuItem } from "@trellis/ui";
import { useId, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { LabelEditor } from "../LabelEditor";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelRowProps = {
	// The key of the project that owns the label.
	project: string;
	label: Label;
	// Every group of the project. The row menu offers each one that does
	// not already hold this label.
	groups: readonly LabelGroup[];
	// True sets the row one step in, under the heading of its group.
	nested?: boolean;
	// True draws the editor under the row summary.
	expanded: boolean;
	onChanged: () => Promise<void>;
	onEdit: () => void;
	onCancel: () => void;
	onDelete: (label: Label) => void;
};

// One label of the settings list: the color dot, the name, the description,
// the number of tickets that hold the label, and the actions. A click on the
// summary opens the editor under it.
export function LabelRow({
	project,
	label,
	groups,
	nested = false,
	expanded,
	onChanged,
	onEdit,
	onCancel,
	onDelete,
}: LabelRowProps) {
	const { client } = useApp();
	const editorId = useId();
	const summaryRef = useRef<HTMLButtonElement>(null);
	const [message, setMessage] = useState<string | null>(null);

	const move = async (group: string | null) => {
		try {
			await client.labels.update({ project, label: label.id, group });
			setMessage(null);
			await onChanged();
		} catch (error) {
			setMessage(labelWriteMessage(error));
		}
	};

	// The editor and the menu both sit inside this row, so the row returns the
	// focus to the summary it took the focus from.
	const closeEditor = () => {
		onCancel();
		summaryRef.current?.focus();
	};

	const moveItems: MenuItem[] = groups
		.filter((group) => group.id !== label.groupId)
		.map((group) => ({
			label: `Move to ${group.name}`,
			icon: <FolderSimple />,
			onSelect: () => void move(group.id),
		}));
	if (label.groupId !== null) {
		moveItems.push({ label: "Move to no group", icon: <FolderSimple />, onSelect: () => void move(null) });
	}
	const items: MenuItem[] = [
		{ label: "Edit", icon: <PencilSimple />, onSelect: onEdit },
		...moveItems,
		{ label: "Delete", icon: <Trash />, danger: true, onSelect: () => onDelete(label) },
	];
	const actions = `Actions for ${label.name}`;

	return (
		<li className="status-row">
			<div className="status-row-summary">
				<button
					ref={summaryRef}
					type="button"
					className="status-row-summary-button"
					aria-label={`Edit ${label.name}`}
					aria-expanded={expanded}
					aria-controls={expanded ? editorId : undefined}
					onClick={onEdit}
				>
					{nested && <span aria-hidden="true" className="label-row-indent" />}
					<span className="label-row-mark">
						<LabelDot color={label.color} />
					</span>
					<span className="status-row-copy">
						<span className="status-row-name">{label.name}</span>
						{label.description !== "" && <span className="status-row-description">{label.description}</span>}
					</span>
				</button>
				{label.ticketCount > 0 && (
					<span className="status-row-count">
						{formatCount(label.ticketCount)} {label.ticketCount === 1 ? "ticket" : "tickets"}
					</span>
				)}
				<Menu
					label={actions}
					triggerTooltip={actions}
					items={items}
					trigger={<IconButton label={actions} icon={<DotsThree />} />}
				/>
			</div>
			{expanded && (
				<div id={editorId}>
					<LabelEditor
						project={project}
						label={label}
						groupId={label.groupId}
						onChanged={onChanged}
						onCancel={closeEditor}
					/>
				</div>
			)}
			{message !== null && <FormStatus state="error" message={message} className="status-row-message" />}
		</li>
	);
}
