import type { Status, StatusCategory } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type StatusCreateFormProps = {
	project: string;
	initialCategory?: StatusCategory;
	initialName?: string;
	busy: boolean;
	onWrite: (operation: () => Promise<void>) => Promise<void>;
	onCreated: (status: Status) => Promise<void>;
	onCancel: () => void;
};

const categories: { value: StatusCategory; label: string }[] = [
	{ value: "todo", label: "Todo" },
	{ value: "started", label: "Started" },
	{ value: "review", label: "Review" },
	{ value: "done", label: "Done" },
	{ value: "canceled", label: "Canceled" },
];

export function StatusCreateForm({
	project,
	initialCategory = "todo",
	initialName = "",
	busy,
	onWrite,
	onCreated,
	onCancel,
}: StatusCreateFormProps) {
	const { client } = useApp();
	const [name, setName] = useState(initialName);
	const [category, setCategory] = useState<StatusCategory>(initialCategory);
	const [nameError, setNameError] = useState<string | null>(null);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (name.trim() === "") {
			setNameError("Enter a status name.");
			return;
		}
		try {
			await onWrite(async () => {
				const status = await client.statuses.create({
					project,
					name: name.trim(),
					category,
				});
				await onCreated(status);
			});
		} catch (error) {
			setNameError((error as Error).message);
		}
	};

	return (
		<form
			onSubmit={(event) => void submit(event)}
			onKeyDown={(event) => {
				if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.stopPropagation();
			}}
			className="status-create-form"
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<Input
					label="Status name"
					value={name}
					error={nameError ?? undefined}
					autoFocus
					disabled={busy}
					onChange={(event) => {
						setName(event.target.value);
						setNameError(null);
					}}
				/>
				<Select label="Category" items={categories} value={category} disabled={busy} onValueChange={setCategory} />
			</div>
			<div className="flex justify-end gap-2">
				<Button type="button" disabled={busy} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" processing={busy}>
					Create status
				</Button>
			</div>
		</form>
	);
}
