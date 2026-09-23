import { FolderPlus, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Label, LabelGroup, Project } from "@trellis/api";
import { Button, EmptyState, IconButton, Input, Skeleton, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { LabelDeleteDialog } from "../LabelDeleteDialog";
import { LabelGroupDeleteDialog } from "../LabelGroupDeleteDialog";
import { LabelGroupForm } from "../LabelGroupForm";
import { SettingsSection } from "../SettingsSection";
import { LabelList } from "./components/LabelList";
import { labelEntries } from "./utils/labelEntries";

export type LabelSettingsProps = {
	project: Project;
};

// The search field appears above this many labels. Under it a person reads
// the whole list faster than a search.
const searchFrom = 8;

const skeletonRows = [0, 1, 2, 3];

// The labels page of the project settings. A project owns its labels and
// its label groups.
export function LabelSettings({ project }: LabelSettingsProps) {
	const { orpc, queryClient } = useApp();
	const query = useQuery(orpc.labels.list.queryOptions({ input: { project: project.key } }));
	const [search, setSearch] = useState("");
	const [creating, setCreating] = useState<{ groupId: string | null } | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [groupForm, setGroupForm] = useState<LabelGroup | "new" | null>(null);
	const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);
	const [deletingGroup, setDeletingGroup] = useState<LabelGroup | null>(null);
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const newLabelRef = useRef<HTMLButtonElement>(null);
	const newGroupRef = useRef<HTMLButtonElement>(null);
	// The menu trigger of each group, by group id. A form that a group menu
	// opens gives the focus back to the trigger it came from.
	const groupMenus = useRef(new Map<string, HTMLButtonElement>());

	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.labels.list.key() });
	};

	const expandGroup = (groupId: string) => {
		setCollapsed((current) => {
			const next = new Set(current);
			next.delete(groupId);
			return next;
		});
	};
	const toggleGroup = (groupId: string) => {
		setCollapsed((current) => {
			const next = new Set(current);
			if (!next.delete(groupId)) next.add(groupId);
			return next;
		});
	};
	const openCreate = (groupId: string | null) => {
		setEditing(null);
		setGroupForm(null);
		setCreating({ groupId });
		if (groupId !== null) expandGroup(groupId);
	};
	const closeCreate = (groupId: string | null) => {
		setCreating(null);
		if (groupId === null) newLabelRef.current?.focus();
		else groupMenus.current.get(groupId)?.focus();
	};
	const openGroupForm = (group: LabelGroup | "new") => {
		setCreating(null);
		setEditing(null);
		setGroupForm(group);
	};
	const closeGroupForm = (group: LabelGroup | null) => {
		setGroupForm(null);
		if (group === null) newGroupRef.current?.focus();
		else groupMenus.current.get(group.id)?.focus();
	};
	const openEdit = (labelId: string) => {
		setCreating(null);
		setGroupForm(null);
		setEditing(labelId);
	};

	if (query.error !== null) {
		return (
			<SettingsSection title="Labels" hint="A label marks a ticket for search and for filters.">
				<div role="alert">
					<EmptyState
						title="The labels did not load."
						description={errorMessage(query.error)}
						action={<Button onClick={() => void query.refetch()}>Retry</Button>}
					/>
				</div>
			</SettingsSection>
		);
	}

	if (query.data === undefined) {
		return (
			<SettingsSection title="Labels" hint="A label marks a ticket for search and for filters.">
				<div role="status" className="status-group">
					<span className="sr-only">Load the labels</span>
					<ul className="status-group-list">
						{skeletonRows.map((row) => (
							<li key={row} className="status-row">
								<div className="label-row-skeleton">
									<Skeleton width="w-2" height="h-2" />
									<Skeleton width="w-40" height="h-3" />
								</div>
							</li>
						))}
					</ul>
				</div>
			</SettingsSection>
		);
	}

	const { labels, groups } = query.data;
	const entries = labelEntries(labels, groups, search);
	const nothingYet = labels.length === 0 && groups.length === 0 && creating === null && groupForm === null;
	const noMatch = entries.length === 0 && creating === null;

	return (
		<SettingsSection
			title="Labels"
			hint="A label marks a ticket for search and for filters."
			actions={
				<div className="flex items-center gap-2">
					<Tooltip content="New group">
						<IconButton
							ref={newGroupRef}
							size="md"
							label="New group"
							icon={<FolderPlus />}
							onClick={() => openGroupForm("new")}
						/>
					</Tooltip>
					<Tooltip content="New label">
						<IconButton
							ref={newLabelRef}
							size="md"
							variant="primary"
							label="New label"
							icon={<Plus />}
							onClick={() => openCreate(null)}
						/>
					</Tooltip>
				</div>
			}
		>
			{labels.length > searchFrom && (
				<div className="label-search">
					<Input
						label="Search labels"
						hideLabel
						placeholder="Search labels"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
				</div>
			)}
			{groupForm === "new" && (
				<LabelGroupForm project={project.key} group={null} onChanged={refresh} onCancel={() => closeGroupForm(null)} />
			)}
			{nothingYet ? (
				<EmptyState
					title="No label yet"
					description="A label marks a ticket. Every project of this tree shares one set of labels."
					action={<Button onClick={() => openCreate(null)}>New label</Button>}
				/>
			) : noMatch ? (
				<EmptyState title="No label matches" description="Change the search text." />
			) : (
				<LabelList
					project={project.key}
					entries={entries}
					groups={groups}
					creating={creating}
					editing={editing}
					renaming={groupForm === "new" ? null : groupForm}
					collapsed={collapsed}
					onGroupMenu={(groupId, node) => {
						if (node === null) groupMenus.current.delete(groupId);
						else groupMenus.current.set(groupId, node);
					}}
					onChanged={refresh}
					onToggleGroup={toggleGroup}
					onEdit={openEdit}
					onCancelEdit={() => setEditing(null)}
					onCloseCreate={closeCreate}
					onNewLabel={openCreate}
					onRename={openGroupForm}
					onCloseRename={closeGroupForm}
					onDeleteLabel={setDeletingLabel}
					onDeleteGroup={setDeletingGroup}
				/>
			)}
			<LabelDeleteDialog
				project={project.key}
				label={deletingLabel}
				onDeleted={refresh}
				onClose={() => setDeletingLabel(null)}
			/>
			<LabelGroupDeleteDialog
				project={project.key}
				group={deletingGroup}
				labels={labels.filter((label) => label.groupId === deletingGroup?.id)}
				onDeleted={refresh}
				onClose={() => setDeletingGroup(null)}
			/>
		</SettingsSection>
	);
}
