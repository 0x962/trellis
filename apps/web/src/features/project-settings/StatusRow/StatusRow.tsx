import type { ColorToken, Reviewer, Status } from "@trellis/api";
import { Button, Checkbox, IconButton, Input, Select, StatusIcon } from "@trellis/ui";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

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
		<li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
			<div className="flex items-center gap-2">
				<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
				<span className="font-mono text-xs text-fg-muted">{status.category}</span>
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
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Input label={`Name for ${status.name}`} value={name} onChange={(event) => setName(event.target.value)} />
				<Select label={`Color for ${status.name}`} items={colors} value={color} onValueChange={setColor} />
				{status.category === "review" ? (
					<Select
						label={`Reviewer for ${status.name}`}
						items={reviewers}
						value={reviewer}
						onValueChange={setReviewer}
					/>
				) : (
					<div />
				)}
				<Input
					label={`WIP limit for ${status.name}`}
					type="number"
					min={1}
					value={wipLimit}
					onChange={(event) => setWipLimit(event.target.value)}
				/>
			</div>
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
