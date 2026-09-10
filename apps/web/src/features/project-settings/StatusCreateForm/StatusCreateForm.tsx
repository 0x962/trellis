import type { Reviewer, StatusCategory } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type StatusCreateFormProps = {
	project: string;
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

const reviewers: { value: Reviewer; label: string }[] = [
	{ value: "agent", label: "Agent" },
	{ value: "human", label: "Human" },
];

export function StatusCreateForm({ project, onCreated, onCancel }: StatusCreateFormProps) {
	const { client } = useApp();
	const [name, setName] = useState("");
	const [category, setCategory] = useState<StatusCategory>("todo");
	const [reviewer, setReviewer] = useState<Reviewer>("agent");
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
				...(category === "review" ? { reviewer } : {}),
			});
			await onCreated();
		} catch (error) {
			setMessage((error as Error).message);
		}
	};

	return (
		<form
			onSubmit={(event) => void submit(event)}
			className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-3"
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<Input label="Status name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
				<Select label="Category" items={categories} value={category} onValueChange={setCategory} />
			</div>
			{category === "review" && (
				<Select label="Reviewer" items={reviewers} value={reviewer} onValueChange={setReviewer} />
			)}
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
					Add status
				</Button>
			</div>
		</form>
	);
}
