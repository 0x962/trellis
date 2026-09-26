import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Project, Status, StatusCategory } from "@trellis/api";
import { FormStatus, IconButton, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsSection } from "../SettingsSection";
import { StatusCreateForm } from "../StatusCreateForm";
import { StatusDeleteDialog } from "../StatusDeleteDialog";
import { StatusRow } from "../StatusRow";

export type StatusSettingsProps = {
	project: Project;
};

const categories: { value: StatusCategory; label: string }[] = [
	{ value: "todo", label: "Todo" },
	{ value: "started", label: "Started" },
	{ value: "review", label: "Review" },
	{ value: "done", label: "Done" },
	{ value: "canceled", label: "Canceled" },
];

export function StatusSettings({ project }: StatusSettingsProps) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery(orpc.statuses.list.queryOptions({ input: { project: project.key } }));
	const countsQuery = useQuery(orpc.tickets.counts.queryOptions({ input: { project: project.key } }));
	const [adding, setAdding] = useState<StatusCategory | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<Status | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const data = query.data;
	const counts = countsQuery.data;

	const refresh = async () => {
		await queryClient.invalidateQueries();
	};

	const move = async (from: number, to: number) => {
		const order = [...data!.statuses];
		const [status] = order.splice(from, 1);
		order.splice(to, 0, status!);
		try {
			await client.statuses.reorder({ project: project.key, statuses: order.map((entry) => entry.id) });
			await refresh();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	if (query.error !== null || countsQuery.error !== null) {
		return (
			<SettingsSection title="Statuses">
				<FormStatus state="error" message="Unable to load statuses. Refresh the page." />
			</SettingsSection>
		);
	}

	if (data === undefined || counts === undefined) {
		return (
			<SettingsSection title="Statuses">
				<Skeleton lines={5} height="h-14" />
			</SettingsSection>
		);
	}

	const countByStatus = new Map(counts.byStatus.map((entry) => [entry.statusId, entry.count]));

	return (
		<SettingsSection title="Statuses">
			<div className="status-groups">
				{categories.map((category) => {
					const statuses = data.statuses.filter((status) => status.category === category.value);
					return (
						<section
							key={category.value}
							aria-labelledby={`status-category-${category.value}`}
							className="status-group"
						>
							<header className="status-group-heading">
								<h3 id={`status-category-${category.value}`} className="status-group-title">
									{category.label}
								</h3>
								<IconButton
									size="xs"
									label={`Add a status to ${category.label}`}
									icon={<Plus />}
									onClick={() => {
										setEditing(null);
										setAdding(category.value);
									}}
								/>
							</header>
							<ul className="status-group-list">
								{statuses.map((status, categoryIndex) => {
									return (
										<StatusRow
											key={status.id}
											project={project.key}
											status={status}
											index={categoryIndex}
											count={statuses.length}
											ticketCount={countByStatus.get(status.id) ?? 0}
											expanded={editing === status.id}
											onChanged={refresh}
											onEdit={() => {
												setAdding(null);
												setEditing(status.id);
											}}
											onCancel={() => setEditing(null)}
											onMove={(from, to) => {
												const fromIndex = data.statuses.findIndex((entry) => entry.id === statuses[from]!.id);
												const toIndex = data.statuses.findIndex((entry) => entry.id === statuses[to]!.id);
												void move(fromIndex, toIndex);
											}}
											onDelete={(entry) => {
												setEditing(null);
												setDeleting(entry);
											}}
										/>
									);
								})}
							</ul>
							{adding === category.value && (
								<StatusCreateForm
									project={project.key}
									initialCategory={category.value}
									onCreated={async () => {
										setAdding(null);
										await refresh();
									}}
									onCancel={() => setAdding(null)}
								/>
							)}
						</section>
					);
				})}
			</div>
			{message !== null && <FormStatus state="error" message={message} />}
			<StatusDeleteDialog
				project={project.key}
				status={deleting}
				statuses={data.statuses}
				onDeleted={refresh}
				onClose={() => setDeleting(null)}
			/>
		</SettingsSection>
	);
}
