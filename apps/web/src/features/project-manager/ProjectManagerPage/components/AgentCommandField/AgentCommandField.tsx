import { AgentCommandSchema } from "@trellis/api";
import { Input } from "@trellis/ui";
import { useId, useState } from "react";

export function AgentCommandField({
	label,
	hint,
	value,
	savedValue = value,
	onCommit,
	onDraft,
}: {
	label: string;
	hint: string;
	value: string;
	savedValue?: string;
	onCommit: (command: string) => void;
	onDraft: (command: string) => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const hintId = useId();
	const commit = () => {
		const parsed = AgentCommandSchema.safeParse(value);
		if (!parsed.success) {
			setError(parsed.error.issues[0]!.message);
			return;
		}
		setError(null);
		if (parsed.data !== savedValue) onCommit(parsed.data);
	};
	return (
		<div className="flex flex-col gap-2">
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
