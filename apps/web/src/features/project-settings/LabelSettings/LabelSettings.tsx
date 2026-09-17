import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { EmptyState, IconButton, Skeleton, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { LabelCreateForm } from "../LabelCreateForm";
import { LabelGroupCreateForm } from "../LabelGroupCreateForm";
import { SettingsSection } from "../SettingsSection";

export type LabelSettingsProps = {
	project: Project;
};

export function LabelSettings({ project }: LabelSettingsProps) {
	const { orpc, queryClient } = useApp();
	const query = useQuery(orpc.labelGroups.list.queryOptions({ input: { project: project.path } }));
	const [addingGroup, setAddingGroup] = useState(false);
	const [addingLabel, setAddingLabel] = useState<string | null>(null);
	const addGroupRef = useRef<HTMLButtonElement>(null);
	const groupsRef = useRef<HTMLDivElement>(null);

	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.labelGroups.list.key() });
	};
	const focusGroupAction = (group: string) => {
		requestAnimationFrame(() => {
			groupsRef.current?.querySelector<HTMLButtonElement>(`[data-label-group="${group}"] button`)?.focus();
		});
	};
	const focusAddGroup = () => {
		requestAnimationFrame(() => addGroupRef.current?.focus());
	};

	if (query.error !== null) {
		return (
			<SettingsSection title="Labels" hint="Label groups organize labels for this project.">
				<p role="alert" className="text-sm text-danger">
					Unable to load labels. Refresh the page.
				</p>
			</SettingsSection>
		);
	}

	if (query.data === undefined) {
		return (
			<SettingsSection title="Labels" hint="Label groups organize labels for this project.">
				<Skeleton lines={4} height="h-14" />
			</SettingsSection>
		);
	}

	return (
		<SettingsSection
			title="Labels"
			hint="Label groups organize labels for this project."
			actions={
				<Tooltip content="Add label group">
					<IconButton
						ref={addGroupRef}
						size="sm"
						label="Add label group"
						icon={<Plus />}
						onClick={() => {
							setAddingLabel(null);
							setAddingGroup(true);
						}}
					/>
				</Tooltip>
			}
		>
			{query.data.groups.length === 0 && !addingGroup ? (
				<EmptyState title="No label groups" description="Create a group to organize labels for this project." />
			) : (
				<div ref={groupsRef} className="status-groups">
					{query.data.groups.map((group) => (
						<section
							key={group.id}
							aria-labelledby={`label-group-${group.id}`}
							className="status-group"
							data-label-group={group.id}
						>
							<header className="status-group-heading">
								<h3 id={`label-group-${group.id}`} className="status-group-title">
									{group.name}
								</h3>
								<Tooltip content={`Add a label to ${group.name}`}>
									<IconButton
										size="xs"
										label={`Add a label to ${group.name}`}
										icon={<Plus />}
										onClick={() => {
											setAddingGroup(false);
											setAddingLabel(group.id);
										}}
									/>
								</Tooltip>
							</header>
							{group.labels.length === 0 && addingLabel !== group.id && (
								<EmptyState description="No labels in this group." className="label-group-empty" />
							)}
							{group.labels.length > 0 && (
								<ul className="status-group-list">
									{group.labels.map((label) => (
										<li key={label.id} className="label-row">
											<span aria-hidden="true" className="label-color" data-color={label.color} />
											<span className="label-name">{label.name}</span>
										</li>
									))}
								</ul>
							)}
							{addingLabel === group.id && (
								<LabelCreateForm
									project={project.path}
									group={group.id}
									onCreated={async () => {
										await refresh();
										setAddingLabel(null);
										focusGroupAction(group.id);
									}}
									onCancel={() => {
										setAddingLabel(null);
										focusGroupAction(group.id);
									}}
								/>
							)}
						</section>
					))}
				</div>
			)}
			{addingGroup && (
				<LabelGroupCreateForm
					project={project.path}
					onCreated={async (group) => {
						await refresh();
						setAddingGroup(false);
						focusGroupAction(group.id);
					}}
					onCancel={() => {
						setAddingGroup(false);
						focusAddGroup();
					}}
				/>
			)}
		</SettingsSection>
	);
}
