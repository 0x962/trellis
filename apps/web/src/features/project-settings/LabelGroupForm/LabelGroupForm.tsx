import type { LabelGroup } from "@trellis/api";
import { LabelGroupNameSchema } from "@trellis/api";
import { Button, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelGroupFormProps = {
	// A project path. The root project of its tree owns the group.
	project: string;
	// The group this form renames. `null` creates a group.
	group: LabelGroup | null;
	onChanged: () => Promise<void>;
	onCancel: () => void;
};

// The one-field form that creates a label group and the one that renames it.
// A new group stands above the list, and a rename stands under the heading of
// the group it changes.
export function LabelGroupForm({ project, group, onChanged, onCancel }: LabelGroupFormProps) {
	const { client } = useApp();
	const [name, setName] = useState(group?.name ?? "");
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const title = group === null ? "New group" : `Rename ${group.name}`;

	const save = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = LabelGroupNameSchema.safeParse(name);
		if (!parsed.success) {
			setMessage(parsed.error.issues[0]!.message);
			return;
		}
		setSaving(true);
		try {
			if (group === null) {
				await client.labelGroups.create({ project, name: parsed.data });
			} else {
				await client.labelGroups.update({ project, group: group.id, name: parsed.data });
			}
			await onChanged();
			onCancel();
		} catch (error) {
			setSaving(false);
			setMessage(labelWriteMessage(error));
		}
	};

	return (
		<form
			aria-label={title}
			className={group === null ? "status-create-form" : "status-row-editor"}
			onSubmit={(event) => void save(event)}
		>
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
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
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
