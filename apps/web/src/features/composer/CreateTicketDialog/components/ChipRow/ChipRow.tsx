import { ArrowElbowDownRight, DotsThree, Tag } from "@phosphor-icons/react";
import type { Label, Priority, Status, TicketLabel } from "@trellis/api";
import { Button, ComposerProperty, IconButton, Popover, PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactNode } from "react";
import { labelNames } from "../../../../../lib/labelNames";
import { LabelPicker } from "../../../../pickers/LabelPicker";
import { PriorityPicker, priorityLabels } from "../../../../pickers/PriorityPicker";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import type { ComposerDraft } from "../../../hooks/useComposerDraft/useComposerDraft";
import type { useCreatePlacement } from "../../../hooks/useCreatePlacement";
import { PlacementPicker } from "../PlacementPicker";

export function ChipRow({
	project,
	statuses,
	status,
	priority,
	automatic,
	parent,
	placement,
	labels,
	onStatus,
	onPriority,
	onParent,
	onEpic,
	onWave,
	onLabel,
	onDiscard,
	agent,
	disabled,
}: {
	project?: string;
	statuses: readonly Status[];
	status?: Status;
	priority: Priority;
	automatic?: ComposerDraft["automatic"];
	parent?: string | null;
	placement: ReturnType<typeof useCreatePlacement>;
	labels: readonly TicketLabel[];
	onStatus: (status: Status) => void;
	onPriority: (priority: Priority) => void;
	onParent: (ref: string | null) => void;
	onEpic: (ref: string | null) => void;
	onWave: (ref: string | null) => void;
	onLabel: (label: Label, checked: boolean) => void;
	onDiscard: () => void;
	agent: ReactNode;
	disabled: boolean;
}) {
	return (
		<>
			<div className="ticket-composer-properties">
				<StatusPicker
					statuses={statuses}
					value={status?.id}
					onPick={onStatus}
					trigger={
						<ComposerProperty
							aria-label={`Status: ${status?.name ?? "None"}`}
							disabled={disabled || !statuses.length}
							icon={status && <StatusIcon category={status.category} />}
						>
							{status?.name ?? "Status"}
						</ComposerProperty>
					}
				/>
				<PriorityPicker
					value={priority}
					onPick={onPriority}
					trigger={
						<ComposerProperty
							aria-label={`Priority: ${priorityLabels[priority]}`}
							glimmer={automatic?.includes("priority")}
							glimmerValue={priority}
							disabled={disabled}
							icon={<PriorityIcon priority={priority} />}
						>
							{priority === "none" ? "Priority" : priorityLabels[priority]}
						</ComposerProperty>
					}
				/>
				{agent}
				<PlacementPicker
					project={project}
					placement={placement}
					glimmer={automatic?.includes("wave")}
					onEpic={onEpic}
					onWave={onWave}
					disabled={disabled}
				/>
				{project && (
					<LabelPicker
						project={project}
						checked={labels.map((label) => label.id)}
						onToggle={onLabel}
						trigger={
							<ComposerProperty
								aria-label={`Labels: ${labels.length ? labelNames(labels) : "None"}`}
								disabled={disabled}
								icon={<Tag />}
							>
								{labels.length ? labelNames(labels) : "Labels"}
							</ComposerProperty>
						}
					/>
				)}
				<Popover
					label="More properties"
					triggerTooltip="More properties"
					className="w-64 p-3"
					trigger={<IconButton label="More properties" icon={<DotsThree />} disabled={disabled} />}
				>
					<div className="flex flex-col gap-4">
						<TicketPicker
							project={project}
							value={parent ?? undefined}
							onPick={(ticket) => onParent(ticket?.identifier ?? null)}
							trigger={
								<ComposerProperty icon={<ArrowElbowDownRight />} aria-label={`Parent: ${parent ?? "None"}`}>
									{parent ?? "Parent ticket"}
								</ComposerProperty>
							}
						/>
						<Button variant="quiet" onClick={onDiscard}>
							Discard draft…
						</Button>
					</div>
				</Popover>
			</div>
			{parent && <p className="mt-2 text-xs text-fg-muted">Sub-ticket of {parent}</p>}
			{placement.message && (
				<p role="status" className="mt-2 text-xs text-fg-muted">
					{placement.message}
				</p>
			)}
		</>
	);
}
