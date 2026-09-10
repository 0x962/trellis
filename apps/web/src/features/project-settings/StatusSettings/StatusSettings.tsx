import { useQuery } from "@tanstack/react-query";
import type { Project, Status } from "@trellis/api";
import { Button, Skeleton, StatusIcon } from "@trellis/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { SettingsSection } from "../SettingsSection";
import { StatusCreateForm } from "../StatusCreateForm";
import { StatusDeleteDialog } from "../StatusDeleteDialog";
import { StatusRow } from "../StatusRow";

export type StatusSettingsProps = {
	project: Project;
};

export function StatusSettings({ project }: StatusSettingsProps) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery(orpc.statuses.list.queryOptions({ input: { project: project.path } }));
	const [adding, setAdding] = useState(false);
	const [clearOpen, setClearOpen] = useState(false);
	const [deleting, setDeleting] = useState<Status | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const data = query.data;
	const inherited = data?.inheritedFrom !== null;

	const refresh = async () => {
		await queryClient.invalidateQueries();
	};

	const move = async (from: number, to: number) => {
		const order = [...data!.statuses];
		const [status] = order.splice(from, 1);
		order.splice(to, 0, status!);
		try {
			await client.statuses.reorder({ project: project.path, statuses: order.map((entry) => entry.id) });
			await refresh();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const clear = async () => {
		try {
			await client.statuses.clear({ project: project.path });
			setClearOpen(false);
			setAdding(false);
			setMessage(null);
			await refresh();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const ownerPath = () => project.ancestors.find((entry) => entry.id === data!.inheritedFrom)!.path;

	if (data === undefined) {
		return (
			<SettingsSection title="Statuses" hint="Statuses define the workflow for tickets in this project.">
				<Skeleton lines={4} height="h-12" />
			</SettingsSection>
		);
	}

	return (
		<SettingsSection
			title="Statuses"
			hint="Statuses define the workflow for tickets in this project."
			actions={
				inherited ? (
					<Button size="sm" onClick={() => setAdding(true)}>
						Customize
					</Button>
				) : undefined
			}
		>
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-fg-muted">
					{inherited ? `Inherited from ${ownerPath()}` : "This project owns its statuses."}
				</p>
				{!inherited && project.parentId !== null && (
					<Button size="sm" onClick={() => setClearOpen(true)}>
						Clear
					</Button>
				)}
			</div>
			{inherited ? (
				<ul className="flex flex-col gap-1">
					{data.statuses.map((status) => (
						<li key={status.id} className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2">
							<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
							<span>{status.name}</span>
							<span className="ml-auto font-mono text-xs text-fg-muted">{status.slug}</span>
						</li>
					))}
				</ul>
			) : (
				<ul className="flex flex-col gap-2">
					{data.statuses.map((status, index) => (
						<StatusRow
							key={status.id}
							project={project.path}
							status={status}
							index={index}
							count={data.statuses.length}
							onChanged={refresh}
							onMove={(from, to) => void move(from, to)}
							onDelete={setDeleting}
						/>
					))}
				</ul>
			)}
			{adding && (
				<StatusCreateForm
					project={project.path}
					onCreated={async () => {
						setAdding(false);
						await refresh();
					}}
					onCancel={() => setAdding(false)}
				/>
			)}
			{!adding && !inherited && (
				<Button icon={<Plus />} className="self-start" onClick={() => setAdding(true)}>
					Add status
				</Button>
			)}
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
			<StatusDeleteDialog
				project={project.path}
				status={deleting}
				statuses={data.statuses}
				onDeleted={refresh}
				onClose={() => setDeleting(null)}
			/>
			<ConfirmActionDialog
				open={clearOpen}
				title="Clear statuses?"
				description="Tickets move to the inherited status set."
				confirmLabel="Clear statuses"
				danger
				onConfirm={() => void clear()}
				onCancel={() => setClearOpen(false)}
			/>
		</SettingsSection>
	);
}
