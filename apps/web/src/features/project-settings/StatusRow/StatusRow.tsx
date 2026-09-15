import { ArrowDown, ArrowUp, CheckCircle, PencilSimple, Trash } from "@phosphor-icons/react";
import type { ColorToken, Reviewer, Status } from "@trellis/api";
import { Button, Checkbox, Input, Menu, Select, StatusIcon, Textarea } from "@trellis/ui";
import { type FormEvent, useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { colorTokens, colorTokenText } from "../../../lib/colorTokens";
import { formatCount } from "../../../lib/format";

export type StatusRowProps = {
	project: string;
	status: Status;
	index: number;
	count: number;
	ticketCount: number;
	expanded: boolean;
	readOnly?: boolean;
	onChanged: () => Promise<void>;
	onEdit: () => void;
	onCancel: () => void;
	onMove: (from: number, to: number) => void;
	onDelete: (status: Status) => void;
};

const reviewers: { value: Reviewer; label: string }[] = [
	{ value: "agent", label: "Agent" },
	{ value: "human", label: "Human" },
];

type StatusEditorProps = Pick<StatusRowProps, "project" | "status" | "onChanged" | "onCancel">;

function StatusEditor({ project, status, onChanged, onCancel }: StatusEditorProps) {
	const { client } = useApp();
	const [name, setName] = useState(status.name);
	const [description, setDescription] = useState(status.description);
	const [color, setColor] = useState<ColorToken>(status.color);
	const [reviewer, setReviewer] = useState<Reviewer>(status.reviewer ?? "agent");
	const [wipLimit, setWipLimit] = useState(status.wipLimit?.toString() ?? "");
	const [isDefault, setIsDefault] = useState(status.isDefault);
	const [message, setMessage] = useState<string | null>(null);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		if (name.trim() === "") {
			setMessage("Enter a status name.");
			return;
		}
		try {
			await client.statuses.update({
				project,
				status: status.id,
				name: name.trim(),
				description,
				color,
				...(status.category === "review" ? { reviewer } : {}),
				wipLimit: wipLimit === "" ? null : Number(wipLimit),
				isDefault,
			});
			setMessage(null);
			await onChanged();
			onCancel();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	return (
		<form aria-label={`Edit ${status.name}`} className="status-row-editor" onSubmit={(event) => void save(event)}>
			<div className="status-row-editor-grid">
				<Input
					label="Name"
					aria-label={`Name for ${status.name}`}
					value={name}
					autoFocus
					onChange={(event) => setName(event.target.value)}
				/>
				<div className="status-row-field">
					<span aria-hidden="true" className="status-row-field-label">
						Color
					</span>
					<Select
						label={`Color for ${status.name}`}
						items={colorTokens}
						value={color}
						onValueChange={setColor}
						className="h-8"
					/>
				</div>
				{status.category === "review" && (
					<div className="status-row-field">
						<span aria-hidden="true" className="status-row-field-label">
							Reviewer
						</span>
						<Select
							label={`Reviewer for ${status.name}`}
							items={reviewers}
							value={reviewer}
							onValueChange={setReviewer}
							className="h-8"
						/>
					</div>
				)}
				<Input
					label="Work in progress limit"
					aria-label={`WIP limit for ${status.name}`}
					type="number"
					min={1}
					value={wipLimit}
					onChange={(event) => setWipLimit(event.target.value)}
				/>
			</div>
			<Textarea
				label="Description"
				aria-label={`Description for ${status.name}`}
				rows={3}
				maxLength={2000}
				value={description}
				onChange={(event) => setDescription(event.target.value)}
			/>
			<div className="status-row-editor-actions">
				<Checkbox label="Default status" checked={isDefault} onCheckedChange={setIsDefault} />
				<div className="status-row-editor-buttons">
					<Button type="button" onClick={onCancel}>
						Cancel
					</Button>
					<Button type="submit" variant="primary">
						Save status
					</Button>
				</div>
			</div>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
		</form>
	);
}

export function StatusRow({
	project,
	status,
	index,
	count,
	ticketCount,
	expanded,
	readOnly = false,
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
				<StatusIcon
					category={status.category}
					reviewer={status.reviewer ?? undefined}
					className={colorTokenText[status.color]}
				/>
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
				{readOnly ? (
					<div className="status-row-summary-button">{summary}</div>
				) : (
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
				)}
				<span className="status-row-count">
					{formatCount(ticketCount)} {ticketCount === 1 ? "ticket" : "tickets"}
				</span>
				{!readOnly && <Menu label={`Actions for ${status.name}`} items={menuItems} />}
			</div>
			{expanded && (
				<div id={editorId}>
					<StatusEditor project={project} status={status} onChanged={onChanged} onCancel={onCancel} />
				</div>
			)}
			{message !== null && (
				<p role="alert" className="status-row-message">
					{message}
				</p>
			)}
		</li>
	);
}
