import { PencilSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { EpicLink, EpicSummary, Priority, Status, Ticket } from "@trellis/api";
import {
	Button,
	IconButton,
	PriorityIcon,
	ProjectKey,
	PropertyRow,
	StatusIcon,
	TicketId,
	Tooltip,
	useHotkey,
} from "@trellis/ui";
import { useEffect } from "react";
import { useArchivedProjects } from "../../../../../hooks/useArchivedProjects";
import { failToast } from "../../../../../lib/failToast";
import { epicSplat } from "../../../../../lib/projectUrl";
import { EpicPicker } from "../../../../pickers/EpicPicker";
import { PriorityPicker, priorityLabels } from "../../../../pickers/PriorityPicker";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import { useStatuses } from "../../../hooks/useStatuses";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { type PickerKind, usePickerStore } from "../../../stores/pickerStore";
import { DependenciesRow } from "../DependenciesRow";
import { LabelsRow } from "../LabelsRow";
import { WaveRow } from "../WaveRow";

export type PickerRowsProps = {
	ticket: Ticket;
};

const triggerClass = "-ml-2 max-w-full justify-start font-normal";

const epicLinkClass =
	"inline-flex h-7 max-w-full min-w-0 items-center rounded-md text-fg transition-colors duration-hover hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

const summaryOf = (status: Status) => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	reviewer: status.reviewer,
	color: status.color,
});

// The rows a person changes through a picker. Each pick paints at once and
// rolls back with a toast on failure. The s, p, l, and Shift+P keys open the
// pickers from anywhere on the page. The status picker lists the statuses of
// the ticket's project. `LabelsRow` holds the labels row and its write. The
// epic value links to the epic page, so its picker opens from the pencil
// beside it. `WaveRow` follows the epic row while the ticket has an epic.
export function PickerRows({ ticket }: PickerRowsProps) {
	const { write } = useTicketWrite(ticket.identifier);
	const statuses = useStatuses(ticket.project.key);
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);

	// A ticket under an archived project takes no write, so its keys open no picker.
	const readOnly = useArchivedProjects().isArchived(ticket.project.key);
	const openByKey = (kind: PickerKind) => () => {
		if (!readOnly) setOpen(kind);
	};

	useEffect(() => () => setOpen(null), [setOpen]);
	useHotkey("s", openByKey("status"));
	useHotkey("p", openByKey("priority"));
	useHotkey("shift+p", openByKey("parent"));
	useHotkey("l", openByKey("labels"));

	const openChange = (kind: PickerKind) => (next: boolean) => setOpen(next ? kind : null);

	const pickStatus = async (status: Status) => {
		setOpen(null);
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, status: status.slug }), {
				optimistic: (row) => ({ ...row, status: summaryOf(status) }),
			});
		} catch (error) {
			failToast(`${ticket.identifier} did not move to ${status.name}.`, error, () => void pickStatus(status));
		}
	};

	const pickPriority = async (priority: Priority) => {
		setOpen(null);
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, priority }), {
				optimistic: (row) => ({ ...row, priority }),
			});
		} catch (error) {
			failToast(
				`The priority of ${ticket.identifier} did not change to ${priorityLabels[priority]}.`,
				error,
				() => void pickPriority(priority),
			);
		}
	};

	const pickEpic = async (epic: EpicSummary | null) => {
		setOpen(null);
		const link: EpicLink | null = epic === null ? null : { id: epic.id, ref: epic.ref, name: epic.name };
		try {
			await write(
				(client) => client.tickets.update({ ticket: ticket.identifier, epic: epic === null ? null : epic.ref }),
				{
					// A wave belongs to one epic, so the server clears the
					// wave of a ticket that leaves its epic.
					optimistic: (row) => ({
						...row,
						epic: link,
						wave: row.epic?.id === link?.id ? row.wave : null,
					}),
				},
			);
		} catch (error) {
			failToast(`The epic of ${ticket.identifier} did not change.`, error, () => void pickEpic(epic));
		}
	};

	const pickParent = async (parent: { id: string; identifier: string } | null) => {
		setOpen(null);
		try {
			await write(
				(client) =>
					client.tickets.update({ ticket: ticket.identifier, parent: parent === null ? null : parent.identifier }),
				{ optimistic: (row) => ({ ...row, parent }) },
			);
		} catch (error) {
			failToast(`The parent of ${ticket.identifier} did not change.`, error, () => void pickParent(parent));
		}
	};

	return (
		<>
			<PropertyRow compact label="Status">
				<StatusPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<span className="inline-flex items-center gap-1.5">
								<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />
								{ticket.status.name}
							</span>
						</Button>
					}
					statuses={statuses}
					value={ticket.status.id}
					onPick={(status) => void pickStatus(status)}
					open={open === "status"}
					onOpenChange={openChange("status")}
				/>
			</PropertyRow>
			<PropertyRow compact label="Priority">
				<PriorityPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<span className="inline-flex items-center gap-1.5">
								<PriorityIcon priority={ticket.priority} decorative />
								{priorityLabels[ticket.priority]}
							</span>
						</Button>
					}
					value={ticket.priority}
					onPick={(priority) => void pickPriority(priority)}
					open={open === "priority"}
					onOpenChange={openChange("priority")}
				/>
			</PropertyRow>
			<LabelsRow ticket={ticket} />
			<PropertyRow compact label="Project">
				<span className="inline-flex h-7 items-center">
					<ProjectKey projectKey={ticket.project.key} color={null} />
				</span>
			</PropertyRow>
			<PropertyRow compact label="Parent">
				<TicketPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							{ticket.parent === null ? (
								<span className="text-fg-muted">None</span>
							) : (
								<TicketId id={ticket.parent.identifier} />
							)}
						</Button>
					}
					project={ticket.project.key}
					exclude={[ticket.identifier]}
					value={ticket.parent?.identifier}
					onPick={(parent) =>
						void pickParent(parent === null ? null : { id: parent.id, identifier: parent.identifier })
					}
					open={open === "parent"}
					onOpenChange={openChange("parent")}
				/>
			</PropertyRow>
			<DependenciesRow ticket={ticket} />
			<PropertyRow compact label="Epic">
				{ticket.epic === null ? (
					<span className="text-fg-muted">None</span>
				) : (
					<Link
						to="/p/$"
						params={{ _splat: epicSplat(ticket.epic.ref) }}
						search={{}}
						className={epicLinkClass}
						title={ticket.epic.name}
					>
						<span className="truncate">{ticket.epic.name}</span>
					</Link>
				)}
				{!readOnly && (
					<Tooltip content="Set epic">
						<span className="inline-flex">
							<EpicPicker
								trigger={<IconButton label="Set epic" icon={<PencilSimple />} size="sm" variant="quiet" />}
								project={ticket.project.key}
								value={ticket.epic?.ref}
								onPick={(epic) => void pickEpic(epic)}
								open={open === "epic"}
								onOpenChange={openChange("epic")}
							/>
						</span>
					</Tooltip>
				)}
			</PropertyRow>
			{ticket.epic !== null && <WaveRow ticket={ticket} epic={ticket.epic} />}
		</>
	);
}
