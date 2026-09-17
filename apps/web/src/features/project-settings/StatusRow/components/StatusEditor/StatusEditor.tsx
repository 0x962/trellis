import type { ColorToken, Reviewer } from "@trellis/api";
import { Button, Checkbox, Input, Select, Textarea } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { StatusRowProps } from "../../StatusRow";
import { ColumnAgentFields } from "../ColumnAgentFields";

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

type StatusEditorProps = Pick<StatusRowProps, "project" | "status" | "onChanged" | "onCancel">;

export function StatusEditor({ project, status, onChanged, onCancel }: StatusEditorProps) {
	const { client } = useApp();
	const canConfigureWorker = status.category !== "done" && status.category !== "canceled";
	const [agentConfig, setAgentConfig] = useState(status.agentConfig);
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
				agentConfig: canConfigureWorker ? agentConfig : null,
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
						items={colors}
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
					label="Column limit"
					aria-label={`WIP limit for ${status.name}`}
					type="number"
					min={1}
					value={wipLimit}
					onChange={(event) => setWipLimit(event.target.value)}
				/>
			</div>
			{canConfigureWorker && <ColumnAgentFields value={agentConfig} onChange={setAgentConfig} />}
			<p className="text-sm text-fg-muted">
				The limit blocks new tickets. Every ticket already in this column keeps its worker.
			</p>
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
