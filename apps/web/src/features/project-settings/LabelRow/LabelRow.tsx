import { DotsThree, FolderSimple, PencilSimple, Trash } from "@phosphor-icons/react";
import { type Label, type LabelGroup, LabelGroupNameSchema } from "@trellis/api";
import { Command, Dialog, FormStatus, IconButton, LabelDot, Menu, type MenuItem } from "@trellis/ui";
import { useId, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { createNameItem } from "../../pickers/utils/createNameItem";
import { LabelEditor } from "../LabelEditor";
import { LabelGroupForm } from "../LabelGroupForm";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelRowProps = {
	// The key of the project that owns the label.
	project: string;
	label: Label;
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
	const [groupPickerOpen, setGroupPickerOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [createGroupName, setCreateGroupName] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [creating, setCreating] = useState(false);
	const moving = useRef(false);

	const move = async (group: string | null) => {
		if (moving.current) return;
		moving.current = true;
		setPending(true);
		try {
			await client.labels.update({ project, label: label.id, group });
			setMessage(null);
			await onChanged();
			setGroupPickerOpen(false);
		} catch (error) {
			setMessage(labelWriteMessage(error));
		} finally {
			moving.current = false;
			setPending(false);
		}
	};

	// The editor and the menu both sit inside this row, so the row returns the
	// focus to the summary it took the focus from.
	const closeEditor = () => {
		onCancel();
		summaryRef.current?.focus();
	};

	const createItem = createNameItem(
		"group",
		search,
		["No group", ...groups.map((group) => group.name)],
		(name) => LabelGroupNameSchema.safeParse(name).success,
	);
	const groupItems = [
		...(label.groupId === null ? [] : [{ id: "no-group", label: "No group" }]),
		...groups.filter((group) => group.id !== label.groupId).map((group) => ({ id: group.id, label: group.name })),
		...(createItem ? [createItem] : []),
	];
	const items: MenuItem[] = [
		{ label: "Edit", icon: <PencilSimple />, onSelect: onEdit },
		{
			label: "Move to group",
			icon: <FolderSimple />,
			onSelect: () => {
				setSearch("");
				setMessage(null);
				setCreateGroupName(null);
				setGroupPickerOpen(true);
			},
		},
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
			{groupPickerOpen && (
				<Dialog
					open
					onOpenChange={(open) => {
						if (!pending && !creating) setGroupPickerOpen(open);
					}}
					title={`Move ${label.name} to group`}
					finalFocus={summaryRef}
				>
					{createGroupName !== null ? (
						<LabelGroupForm
							project={project}
							initialName={createGroupName}
							onPendingChange={setCreating}
							onChanged={onChanged}
							onCancel={() => setCreateGroupName(null)}
							onCreated={(group) => {
								setCreateGroupName(null);
								void move(group.id);
							}}
						/>
					) : (
						<div inert={pending} aria-busy={pending}>
							<Command
								label="Search groups"
								placeholder="Search groups"
								autoFocus
								items={groupItems}
								onSearchChange={setSearch}
								onSelect={(id) => {
									if (id === createItem?.id) setCreateGroupName(search.trim());
									else void move(id === "no-group" ? null : id);
								}}
							/>
						</div>
					)}
					<FormStatus status={message ? "error" : pending ? "saving" : "idle"} message={message ?? undefined} />
				</Dialog>
			)}
			{!groupPickerOpen && message !== null && (
				<FormStatus status="error" message={message} className="status-row-message" />
			)}
		</li>
	);
}
