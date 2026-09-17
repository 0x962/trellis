import type { ColorToken } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { type FormEvent, useId, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type LabelCreateFormProps = {
	project: string;
	group: string;
	onCreated: () => Promise<void>;
	onCancel: () => void;
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

export function LabelCreateForm({ project, group, onCreated, onCancel }: LabelCreateFormProps) {
	const { client } = useApp();
	const messageId = useId();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState("");
	const [color, setColor] = useState<ColorToken>("fg-muted");
	const [message, setMessage] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (name.trim() === "") {
			setMessage("Enter a label name.");
			nameRef.current?.focus();
			return;
		}
		setSubmitting(true);
		try {
			await client.labelGroups.createLabel({ project, group, name: name.trim(), color });
			await onCreated();
		} catch (error) {
			setSubmitting(false);
			setMessage(
				(error as { code?: string }).code === "DUPLICATE"
					? "Use a different label name in this group."
					: (error as Error).message,
			);
			nameRef.current?.focus();
		}
	};

	return (
		<form onSubmit={(event) => void submit(event)} className="label-create-form">
			<div className="label-create-fields">
				<Input
					ref={nameRef}
					label="Label name"
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
				<div className="label-color-field">
					<span className="label-color-label">Color</span>
					<Select label="Label color" items={colors} value={color} onValueChange={setColor} disabled={submitting} />
				</div>
			</div>
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
					Create label
				</Button>
			</div>
		</form>
	);
}
