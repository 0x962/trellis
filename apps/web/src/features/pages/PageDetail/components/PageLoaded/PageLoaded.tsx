import {
	ArrowCounterClockwise,
	ArrowUUpLeft,
	ClockCounterClockwise,
	DotsThree,
	DownloadSimple,
	PencilSimple,
	PushPinSimple,
	ShareNetwork,
	Trash,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { PageDetail as PageRecord, Project } from "@trellis/api";
import { Badge, ConfirmDialog, EmptyState, InlineEdit, Menu, Tooltip } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { ArchivedBanner } from "../../../../project-actions";
import { PageTitle } from "../../../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../../../shell/ProjectBreadcrumb";
import { Topbar, TopbarActionButton } from "../../../../shell/Topbar";
import { usePageActions } from "../../usePageActions";
import { PageFrame } from "../PageFrame";
import { PageHistory } from "../PageHistory";
import { PageShare } from "../PageShare";

export function PageLoaded({
	page,
	project,
	historical,
	offline,
}: {
	page: PageRecord;
	project: Project;
	historical: boolean;
	offline: boolean;
}) {
	const { live } = useApp();
	const status = useLiveStatus(live);
	const disconnected = offline || status !== "live";
	const menuTrigger = useRef<HTMLButtonElement>(null);
	const shareTrigger = useRef<HTMLButtonElement>(null);
	const [editing, setEditing] = useState(false);
	const [panel, setPanel] = useState<"history" | "share" | "delete" | null>(null);
	const { mutation, rename } = usePageActions(page, disconnected, project.archivedAt !== null);
	const deleted = page.deletedAt !== null;
	const blocked = disconnected || project.archivedAt !== null || mutation.isPending;
	useEffect(() => {
		document.title = `${page.title} · trellis`;
	}, [page.title]);
	return (
		<>
			<Topbar
				actions={
					<>
						<Tooltip content={page.pinned ? "Unpin Page" : "Pin Page"}>
							<TopbarActionButton
								pressed={page.pinned}
								label={page.pinned ? "Unpin Page" : "Pin Page"}
								icon={<PushPinSimple weight={page.pinned ? "fill" : "regular"} />}
								disabled={blocked || deleted}
								onClick={() => mutation.mutate("pin")}
							/>
						</Tooltip>
						<Tooltip content="Share Page">
							<TopbarActionButton
								ref={shareTrigger}
								label="Share Page"
								icon={<ShareNetwork />}
								onClick={() => setPanel("share")}
							/>
						</Tooltip>
						<Menu
							trigger={<TopbarActionButton ref={menuTrigger} label="Page actions" icon={<DotsThree />} />}
							label="Page actions"
							triggerTooltip="Page actions"
							items={[
								{
									label: "Rename",
									icon: <PencilSimple />,
									disabled: blocked || deleted,
									onSelect: () => setEditing(true),
								},
								{
									label: "Version history",
									icon: <ClockCounterClockwise />,
									disabled: deleted,
									onSelect: () => setPanel("history"),
								},
								{
									label: "Pull source snapshot",
									icon: <DownloadSimple />,
									disabled: disconnected || deleted || mutation.isPending,
									onSelect: () => mutation.mutate("pull"),
								},
								deleted
									? {
											label: "Restore",
											icon: <ArrowCounterClockwise />,
											disabled: blocked,
											onSelect: () => mutation.mutate("restore"),
										}
									: {
											label: "Delete",
											icon: <Trash />,
											danger: true,
											disabled: blocked,
											onSelect: () => setPanel("delete"),
										},
							]}
						/>
					</>
				}
			>
				<PageTitle
					parent={<ProjectBreadcrumb project={project} />}
					title={
						<InlineEdit
							label="Page title"
							value={page.title}
							editing={editing}
							onEditingChange={setEditing}
							onSave={rename}
						>
							<span className="block truncate">{page.title}</span>
						</InlineEdit>
					}
				/>
			</Topbar>
			<div className="page-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{project.archivedAt !== null && <ArchivedBanner project={project} />}
				{disconnected && (
					<p role="status" className="border-b border-border px-5 py-2 text-sm text-fg-muted">
						Offline. Page actions are unavailable.
					</p>
				)}
				<div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2 text-sm text-fg-muted">
					<Badge>
						Version {page.requestedVersion.number}
						{historical ? ", read-only" : ""}
					</Badge>
					<span>{page.requestedVersion.actor.displayName ?? page.requestedVersion.actor.name}</span>
					<span>{page.watcher?.agent.name ?? "No watcher"}</span>
					<span className="tabular">{page.openThreadCount} open threads</span>
					{historical && (
						<Tooltip content="Back to current">
							<TopbarActionButton
								label="Back to current"
								icon={<ArrowUUpLeft />}
								render={<Link to="/p/$" params={{ _splat: page.ref }} search={{}} />}
							/>
						</Tooltip>
					)}
				</div>
				{deleted ? (
					<EmptyState
						variant="page"
						title="This Page is deleted"
						description={`Deleted by ${page.deletedBy?.displayName ?? page.deletedBy?.name}. Purge date: ${new Date(page.purgeAt!).toLocaleString()}.`}
						action={
							<Tooltip content="Restore Page">
								<TopbarActionButton
									label="Restore Page"
									icon={<ArrowCounterClockwise />}
									disabled={blocked}
									onClick={() => mutation.mutate("restore")}
								/>
							</Tooltip>
						}
					/>
				) : (
					<PageFrame
						key={`${page.id}/${page.requestedVersion.number}`}
						page={page.ref}
						version={page.requestedVersion.number}
						title={page.title}
					/>
				)}
			</div>
			{panel === "history" && <PageHistory finalFocus={menuTrigger} page={page} onClose={() => setPanel(null)} />}
			{panel === "share" && <PageShare finalFocus={shareTrigger} page={page} onClose={() => setPanel(null)} />}
			<ConfirmDialog
				open={panel === "delete"}
				finalFocus={menuTrigger}
				title="Delete this Page?"
				description="Trellis keeps its versions for 30 days. You can restore the Page during that time."
				confirmLabel="Delete"
				danger
				processing={mutation.isPending}
				onCancel={() => setPanel(null)}
				onConfirm={() => mutation.mutate("delete", { onSuccess: () => setPanel(null) })}
			/>
		</>
	);
}
