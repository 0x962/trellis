import type { Label } from "@trellis/api";
import { LabelDescriptionSchema, LabelNameSchema } from "@trellis/api";
import { Button, Input, type LabelColor, LabelDot, labelColors, Select, type SelectItem } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelEditorProps = {
	// A project path. The root project of its tree owns the label.
	project: string;
	// The label this form changes. `null` creates a label.
	label: Label | null;
	// The group a new label joins. `null` creates a label with no group.
	groupId: string | null;
	onChanged: () => Promise<void>;
	onCancel: () => void;
};

// The color field lists the hues by name, each one behind its own dot.
const hueNames: Record<LabelColor, string> = {
	gray: "Gray",
	red: "Red",
	orange: "Orange",
	yellow: "Yellow",
	green: "Green",
	teal: "Teal",
	blue: "Blue",
	purple: "Purple",
	pink: "Pink",
};

// "Auto" sends no color, and the server takes a hue that no other label of
// the project tree uses.
type ColorChoice = LabelColor | "auto";

const hueItems: SelectItem<ColorChoice>[] = labelColors.map((hue) => ({
	value: hue,
	label: hueNames[hue],
	icon: <LabelDot color={hue} variant="icon" />,
}));

const autoItem: SelectItem<ColorChoice> = { value: "auto", label: "Auto" };

// The form that creates a label and the form that changes one. The name, the
// color, and the description are the fields a person owns; the group comes
// from the row the form opens in, and the Move actions of the row menu change
// it later.
export function LabelEditor({ project, label, groupId, onChanged, onCancel }: LabelEditorProps) {
	const { client } = useApp();
	const [name, setName] = useState(label?.name ?? "");
	const [description, setDescription] = useState(label?.description ?? "");
	const [color, setColor] = useState<ColorChoice>(label?.color ?? "auto");
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const items = label === null ? [autoItem, ...hueItems] : hueItems;
	const title = label === null ? "New label" : `Edit ${label.name}`;

	const save = async (event: FormEvent) => {
		event.preventDefault();
		const parsedName = LabelNameSchema.safeParse(name);
		if (!parsedName.success) {
			setMessage(parsedName.error.issues[0]!.message);
			return;
		}
		const parsedDescription = LabelDescriptionSchema.safeParse(description);
		if (!parsedDescription.success) {
			setMessage(parsedDescription.error.issues[0]!.message);
			return;
		}
		const fields = {
			name: parsedName.data,
			description: parsedDescription.data,
			...(color === "auto" ? {} : { color }),
		};
		setSaving(true);
		try {
			if (label === null) {
				await client.labels.create({ project, ...fields, ...(groupId === null ? {} : { group: groupId }) });
			} else {
				await client.labels.update({ project, label: label.id, ...fields });
			}
			await onChanged();
			onCancel();
		} catch (error) {
			setSaving(false);
			setMessage(labelWriteMessage(error));
		}
	};

	return (
		<form aria-label={title} className="status-row-editor" onSubmit={(event) => void save(event)}>
			<div className="status-row-editor-grid">
				<Input
					label="Name"
					value={name}
					maxLength={80}
					autoFocus
					invalid={message !== null}
					onChange={(event) => {
						setName(event.target.value);
						setMessage(null);
					}}
				/>
				<div className="status-row-field">
					<span aria-hidden="true" className="status-row-field-label">
						Color
					</span>
					<Select label="Color" items={items} value={color} onValueChange={setColor} className="h-8" />
				</div>
			</div>
			<Input
				label="Description"
				value={description}
				maxLength={255}
				onChange={(event) => setDescription(event.target.value)}
			/>
			<div className="status-row-editor-buttons justify-end">
				<Button type="button" disabled={saving} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" processing={saving}>
					Save
				</Button>
			</div>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
		</form>
	);
}
