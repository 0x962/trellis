import type { StatusCategory } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type StatusCreateFormProps = {
	project: string;
	initialCategory?: StatusCategory;
	onCreated: () => Promise<void>;
	onCancel: () => void;
};

const categories: { value: StatusCategory; label: string }[] = [
	{ value: "todo", label: "Todo" },
	{ value: "started", label: "Started" },
	{ value: "review", label: "Review" },
	{ value: "done", label: "Done" },
	{ value: "canceled", label: "Canceled" },
];

export function StatusCreateForm({ project, initialCategory = "todo", onCreated, onCancel }: StatusCreateFormProps) {
	const { client } = useApp();
	const [name, setName] = useState("");
	const [category, setCategory] = useState<StatusCategory>(initialCategory);
	const [message, setMessage] = useState<string | null>(null);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (name.trim() === "") {
			setMessage("Enter a status name.");
			return;
		}
		try {
			await client.statuses.create({
				project,
				name: name.trim(),
				category,
			});
			await onCreated();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	return (
		<form onSubmit={(event) => void submit(event)} className="status-create-form">
			<div className="grid gap-3 sm:grid-cols-2">
				<Input label="Status name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
				<Select label="Category" items={categories} value={category} onValueChange={setCategory} />
			</div>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button type="button" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="primary">
					Create status
				</Button>
			</div>
		</form>
	);
}
