import type { LabelGroup } from "@trellis/api";
import { Button, Input } from "@trellis/ui";
import { type FormEvent, useId, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type LabelGroupCreateFormProps = {
	project: string;
	onCreated: (group: LabelGroup) => Promise<void>;
	onCancel: () => void;
};

export function LabelGroupCreateForm({ project, onCreated, onCancel }: LabelGroupCreateFormProps) {
	const { client } = useApp();
	const messageId = useId();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (name.trim() === "") {
			setMessage("Enter a group name.");
			nameRef.current?.focus();
			return;
		}
		setSubmitting(true);
		try {
			const group = await client.labelGroups.create({ project, name: name.trim() });
			await onCreated(group);
		} catch (error) {
			setSubmitting(false);
			setMessage(
				(error as { code?: string }).code === "DUPLICATE" ? "Use a different group name." : (error as Error).message,
			);
			nameRef.current?.focus();
		}
	};

	return (
		<form onSubmit={(event) => void submit(event)} className="status-create-form">
			<Input
				ref={nameRef}
				label="Group name"
				value={name}
				maxLength={80}
				autoFocus
				invalid={message !== null}
				aria-describedby={message !== null ? messageId : undefined}
				onChange={(event) => {
					setName(event.target.value);
					setMessage(null);
				}}
			/>
			{message !== null && (
				<p id={messageId} role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
			<div className="label-form-actions">
				<Button type="button" disabled={submitting} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" processing={submitting}>
					Create group
				</Button>
			</div>
		</form>
	);
}
