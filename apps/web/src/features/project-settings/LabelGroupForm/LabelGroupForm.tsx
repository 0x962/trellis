import { type LabelGroup, LabelGroupNameSchema } from "@trellis/api";
import { Button, Input } from "@trellis/ui";
import { type FormEvent, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { labelWriteMessage } from "../labelWriteMessage";

export type LabelGroupFormProps = {
	// The key of the project that owns the group.
	project: string;
	initialName?: string;
	onCreated?: (group: LabelGroup) => void;
	onPendingChange?: (pending: boolean) => void;
	onChanged: () => Promise<void>;
	onCancel: () => void;
};

export function LabelGroupForm({
	project,
	initialName = "",
	onCreated,
	onPendingChange,
	onChanged,
	onCancel,
}: LabelGroupFormProps) {
	const { client } = useApp();
	const [name, setName] = useState(initialName);
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const submitting = useRef(false);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (submitting.current) return;
		const parsed = LabelGroupNameSchema.safeParse(name);
		if (!parsed.success) {
			setMessage(parsed.error.issues[0]!.message);
			return;
		}
		submitting.current = true;
		setSaving(true);
		onPendingChange?.(true);
		try {
			const group = await client.labelGroups.create({ project, name: parsed.data });
			await onChanged();
			if (onCreated) onCreated(group);
			else onCancel();
		} catch (error) {
			setSaving(false);
			setMessage(labelWriteMessage(error));
		} finally {
			submitting.current = false;
			onPendingChange?.(false);
		}
	};

	return (
		<form aria-label="New group" className="status-create-form" onSubmit={(event) => void save(event)}>
			<Input
				label="Group name"
				value={name}
				disabled={saving}
				autoFocus
				error={message ?? undefined}
				onChange={(event) => {
					setName(event.target.value);
					setMessage(null);
				}}
			/>
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
