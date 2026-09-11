import type { ColorToken, Reviewer, Status } from "@trellis/api";
import { Button, Checkbox, IconButton, Input, Select, StatusIcon } from "@trellis/ui";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { StatusDescriptionField } from "../StatusDescriptionField";

export type StatusRowProps = {
	project: string;
	status: Status;
	index: number;
	count: number;
	onChanged: () => Promise<void>;
	onMove: (from: number, to: number) => void;
	onDelete: (status: Status) => void;
};

const colors: { value: ColorToken; label: string }[] = [
	{ value: "fg", label: "Foreground" },
	{ value: "fg-muted", label: "Muted" },
	{ value: "fg-faint", label: "Faint" },
	{ value: "accent", label: "Accent" },
	{ value: "agent", label: "Agent" },
	{ value: "success", label: "Success" },
	{ value: "warning", label: "Warning" },
	{ value: "danger", label: "Danger" },
];

const reviewers: { value: Reviewer; label: string }[] = [
	{ value: "agent", label: "Agent" },
	{ value: "human", label: "Human" },
];

export function StatusRow({ project, status, index, count, onChanged, onMove, onDelete }: StatusRowProps) {
	const { client } = useApp();
	const [name, setName] = useState(status.name);
	const [color, setColor] = useState<ColorToken>(status.color);
	const [reviewer, setReviewer] = useState<Reviewer>(status.reviewer ?? "agent");
	const [wipLimit, setWipLimit] = useState(status.wipLimit?.toString() ?? "");
	const [isDefault, setIsDefault] = useState(status.isDefault);
	const [message, setMessage] = useState<string | null>(null);

	const save = async () => {
		try {
			await client.statuses.update({
				project,
				status: status.id,
				name: name.trim(),
				color,
				...(status.category === "review" ? { reviewer } : {}),
				wipLimit: wipLimit === "" ? null : Number(wipLimit),
				isDefault,
			});
			setMessage(null);
			await onChanged();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	return (
		<li className="flex flex-col gap-4 border border-border bg-surface p-4">
			<div className="flex items-center gap-2">
				<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
				<h3 className="text-md font-medium text-fg">{status.name}</h3>
				<span className="text-xs text-fg-muted">{status.category}</span>
				<div className="ml-auto flex items-center gap-1">
					<IconButton
						size="sm"
						label={`Move ${status.name} up`}
						icon={<ArrowUp />}
						disabled={index === 0}
						onClick={() => onMove(index, index - 1)}
					/>
					<IconButton
						size="sm"
						label={`Move ${status.name} down`}
						icon={<ArrowDown />}
						disabled={index === count - 1}
						onClick={() => onMove(index, index + 1)}
					/>
					<IconButton size="sm" label={`Delete ${status.name}`} icon={<Trash2 />} onClick={() => onDelete(status)} />
				</div>
			</div>
			<div className="grid items-end gap-3 sm:grid-cols-2">
				<Input
					label="Name"
					aria-label={`Name for ${status.name}`}
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
				<div className="flex flex-col gap-1">
					<span aria-hidden="true" className="text-sm text-fg-muted">
						Color
					</span>
					<Select
						label={`Color for ${status.name}`}
						items={colors}
						value={color}
						onValueChange={setColor}
						className="h-8"
					/>
				</div>
				{status.category === "review" && (
					<div className="flex flex-col gap-1">
						<span aria-hidden="true" className="text-sm text-fg-muted">
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
			<StatusDescriptionField project={project} status={status} />
			<div className="flex items-center justify-between gap-3">
				<Checkbox label={`Default status ${status.name}`} checked={isDefault} onCheckedChange={setIsDefault} />
				<Button size="sm" onClick={() => void save()}>
					Save {status.name}
				</Button>
			</div>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
		</li>
	);
}
