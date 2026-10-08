import type { ColorToken } from "@trellis/api";
import { Button, Checkbox, Input, Select, Textarea } from "@trellis/ui";
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

export type StatusEditorProps = Pick<
	StatusRowProps,
	"project" | "status" | "busy" | "onWrite" | "onChanged" | "onCancel"
>;

export function StatusEditor({ project, status, busy, onWrite, onChanged, onCancel }: StatusEditorProps) {
	const { client } = useApp();
	const [name, setName] = useState(status.name);
	const [description, setDescription] = useState(status.description);
	const [color, setColor] = useState<ColorToken>(status.color);
	const [isDefault, setIsDefault] = useState(status.isDefault);
	const [nameError, setNameError] = useState<string | null>(null);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		if (name.trim() === "") {
			setNameError("Enter a status name.");
			return;
		}
		try {
			await onWrite(async () => {
				await client.statuses.update({
					project,
					status: status.id,
					name: name.trim(),
					description,
					color,
					isDefault,
				});
				await onChanged();
				onCancel();
			});
		} catch (error) {
			setNameError((error as Error).message);
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
					error={nameError ?? undefined}
					disabled={busy}
					onChange={(event) => {
						setName(event.target.value);
						setNameError(null);
					}}
				/>
				<Select
					label={`Color for ${status.name}`}
					hideLabel={false}
					items={colors}
					value={color}
					onValueChange={setColor}
					disabled={busy}
					className="h-8"
				/>
			</div>
			<Textarea
				label="Description"
				aria-label={`Description for ${status.name}`}
				rows={3}
				value={description}
				disabled={busy}
				onChange={(event) => setDescription(event.target.value)}
			/>
			<div className="status-row-editor-actions">
				<Checkbox label="Default status" checked={isDefault} disabled={busy} onCheckedChange={setIsDefault} />
				<div className="status-row-editor-buttons">
					<Button type="button" disabled={busy} onClick={onCancel}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={busy}>
						Save status
					</Button>
				</div>
			</div>
		</form>
	);
}
