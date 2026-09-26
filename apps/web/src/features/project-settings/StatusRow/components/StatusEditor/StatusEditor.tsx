import type { ColorToken } from "@trellis/api";
import { Button, Checkbox, FormStatus, Input, Select, Textarea } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { StatusRowProps } from "../../StatusRow";

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

type StatusEditorProps = Pick<StatusRowProps, "project" | "status" | "onChanged" | "onCancel">;

export function StatusEditor({ project, status, onChanged, onCancel }: StatusEditorProps) {
	const { client } = useApp();
	const [name, setName] = useState(status.name);
	const [description, setDescription] = useState(status.description);
	const [color, setColor] = useState<ColorToken>(status.color);
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
				<Select
					label={`Color for ${status.name}`}
					hideLabel={false}
					items={colors}
					value={color}
					onValueChange={setColor}
					className="h-8"
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
			{message !== null && <FormStatus state="error" message={message} />}
		</form>
	);
}
