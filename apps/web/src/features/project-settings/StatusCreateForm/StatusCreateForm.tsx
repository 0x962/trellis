import type { Reviewer, StatusAgentConfig, StatusCategory } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ColumnAgentFields } from "../StatusRow/components/ColumnAgentFields";

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

const reviewers: { value: Reviewer; label: string }[] = [
	{ value: "agent", label: "Agent" },
	{ value: "human", label: "Human" },
];

export function StatusCreateForm({ project, initialCategory = "todo", onCreated, onCancel }: StatusCreateFormProps) {
	const { client } = useApp();
	const [name, setName] = useState("");
	const [category, setCategory] = useState<StatusCategory>(initialCategory);
	const [reviewer, setReviewer] = useState<Reviewer>("agent");
	const [agentConfig, setAgentConfig] = useState<StatusAgentConfig | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const canConfigureWorker = category !== "done" && category !== "canceled";

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
				agentConfig: canConfigureWorker ? agentConfig : null,
				...(category === "review" ? { reviewer } : {}),
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
			{category === "review" && (
				<Select label="Reviewer" items={reviewers} value={reviewer} onValueChange={setReviewer} />
			)}
			{canConfigureWorker && <ColumnAgentFields value={agentConfig} onChange={setAgentConfig} />}
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
