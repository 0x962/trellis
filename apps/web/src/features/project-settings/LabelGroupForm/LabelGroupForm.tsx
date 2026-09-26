import { LabelGroupNameSchema } from "@trellis/api";
import { Button, FormStatus, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelGroupFormProps = {
	// The key of the project that owns the group.
	project: string;
	onChanged: () => Promise<void>;
	onCancel: () => void;
};

// The form that creates a label group. It stands above the list. A group
// that exists takes its new name in the heading band, through the name field
// of `LabelGroupRow`.
export function LabelGroupForm({ project, onChanged, onCancel }: LabelGroupFormProps) {
	const { client } = useApp();
	const [name, setName] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = LabelGroupNameSchema.safeParse(name);
		if (!parsed.success) {
			setMessage(parsed.error.issues[0]!.message);
			return;
		}
		setSaving(true);
		try {
			await client.labelGroups.create({ project, name: parsed.data });
			await onChanged();
			onCancel();
		} catch (error) {
			setSaving(false);
			setMessage(labelWriteMessage(error));
		}
	};

	return (
		<form aria-label="New group" className="status-create-form" onSubmit={(event) => void save(event)}>
			<Input
				label="Group name"
				value={name}
				maxLength={80}
				autoFocus
				invalid={message !== null}
				onChange={(event) => {
					setName(event.target.value);
					setMessage(null);
				}}
			/>
			{message !== null && <FormStatus state="error" message={message} />}
			<div className="status-row-editor-buttons justify-end">
				<Button type="button" disabled={saving} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" processing={saving}>
					Save
				</Button>
			</div>
		</form>
	);
}
