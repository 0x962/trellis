import { ArrowDown, ArrowUp, CheckCircle, PencilSimple, Trash } from "@phosphor-icons/react";
import type { ColorToken, Status } from "@trellis/api";
import { FormStatus, Menu, StatusIcon } from "@trellis/ui";
import { useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { StatusEditor } from "./components/StatusEditor";

export type StatusRowProps = {
	project: string;
	status: Status;
	index: number;
	count: number;
	ticketCount: number;
	expanded: boolean;
	onChanged: () => Promise<void>;
	onEdit: () => void;
	onCancel: () => void;
	onMove: (from: number, to: number) => void;
	onDelete: (status: Status) => void;
};

const iconColors: Record<ColorToken, string> = {
	fg: "!text-fg",
	"fg-muted": "!text-fg-muted",
	"fg-faint": "!text-fg-faint",
	accent: "!text-accent",
	agent: "!text-accent",
	success: "!text-success",
	warning: "!text-warning",
	danger: "!text-danger",
};

export function StatusRow({
	project,
	status,
	index,
	count,
	ticketCount,
	expanded,
	onChanged,
	onEdit,
	onCancel,
	onMove,
	onDelete,
}: StatusRowProps) {
	const { client } = useApp();
	const editorId = useId();
	const [message, setMessage] = useState<string | null>(null);

	const makeDefault = async () => {
		try {
			await client.statuses.update({ project, status: status.id, isDefault: true });
			setMessage(null);
			await onChanged();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	const menuItems = [
		{ label: "Edit", icon: <PencilSimple />, onSelect: onEdit },
		status.isDefault
			? { label: "Default status", icon: <CheckCircle />, disabled: true, onSelect: () => {} }
			: { label: "Make default", icon: <CheckCircle />, onSelect: () => void makeDefault() },
		{ label: "Move up", icon: <ArrowUp />, disabled: index === 0, onSelect: () => onMove(index, index - 1) },
		{
			label: "Move down",
			icon: <ArrowDown />,
			disabled: index === count - 1,
			onSelect: () => onMove(index, index + 1),
		},
		{ label: "Delete", icon: <Trash />, danger: true, onSelect: () => onDelete(status) },
	];
	const summary = (
		<>
			<span className="status-row-icon">
				<StatusIcon category={status.category} className={iconColors[status.color]} />
			</span>
			<span className="status-row-copy">
				<span className="status-row-name-line">
					<span className="status-row-name">{status.name}</span>
					{status.isDefault && <span className="status-row-default">Default</span>}
				</span>
				{status.description !== "" && <span className="status-row-description">{status.description}</span>}
			</span>
		</>
	);

	return (
		<li className="status-row">
			<div className="status-row-summary">
				<button
					type="button"
					className="status-row-summary-button"
					aria-label={`Edit ${status.name}`}
					aria-expanded={expanded}
					aria-controls={expanded ? editorId : undefined}
					onClick={onEdit}
				>
					{summary}
				</button>
				<span className="status-row-count">
					{formatCount(ticketCount)} {ticketCount === 1 ? "ticket" : "tickets"}
				</span>
				<Menu label={`Actions for ${status.name}`} items={menuItems} />
			</div>
			{expanded && (
				<div id={editorId}>
					<StatusEditor project={project} status={status} onChanged={onChanged} onCancel={onCancel} />
				</div>
			)}
			{message !== null && <FormStatus status="error" message={message} className="status-row-message" />}
		</li>
	);
}
