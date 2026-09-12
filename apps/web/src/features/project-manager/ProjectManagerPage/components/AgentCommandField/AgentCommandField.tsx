import { AdeCommandSchema, AgentCommandSchema } from "@trellis/api";
import { Input, Textarea } from "@trellis/ui";
import { useId, useState } from "react";

export function AgentCommandField({
	label,
	hint,
	value,
	savedValue = value,
	ade = false,
	onCommit,
	onDraft,
}: {
	label: string;
	hint: string;
	value: string;
	savedValue?: string;
	ade?: boolean;
	onCommit: (command: string) => void;
	onDraft: (command: string) => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const hintId = useId();
	const commit = () => {
		const parsed = (ade ? AdeCommandSchema : AgentCommandSchema).safeParse(value);
		if (!parsed.success) {
			setError(parsed.error.issues[0]!.message);
			return;
		}
		setError(null);
		if (parsed.data !== savedValue) onCommit(parsed.data);
	};
	return (
		<div className="flex flex-col gap-2">
			{ade ? (
				<Textarea
					label={label}
					value={value}
					invalid={error !== null}
					aria-describedby={hintId}
					rows={4}
					className="text-sm"
					spellCheck={false}
					onChange={(event) => {
						setError(null);
						onDraft(event.target.value);
					}}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							commit();
						}
					}}
				/>
			) : (
				<Input
					label={label}
					value={value}
					invalid={error !== null}
					aria-describedby={hintId}
					onChange={(event) => {
						setError(null);
						onDraft(event.target.value);
					}}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commit();
						}
					}}
				/>
			)}
			<p id={hintId} className="text-sm text-fg-muted">
				{hint}
			</p>
			{error !== null && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
