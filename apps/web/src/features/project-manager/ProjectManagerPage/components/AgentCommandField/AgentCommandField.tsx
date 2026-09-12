import { AgentCommandSchema, HarnessCommandSchema } from "@trellis/api";
import { Input, Textarea } from "@trellis/ui";
import { useId, useState } from "react";

export function AgentCommandField({
	label,
	hint,
	value,
	savedValue = value,
	harness = false,
	onCommit,
}: {
	label: string;
	hint: string;
	value: string;
	savedValue?: string;
	harness?: boolean;
	onCommit: (command: string) => void;
}) {
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const hintId = useId();
	const commit = () => {
		const parsed = (harness ? HarnessCommandSchema : AgentCommandSchema).safeParse(text ?? value);
		if (!parsed.success) {
			setError(parsed.error.issues[0]!.message);
			return;
		}
		setError(null);
		setText(null);
		if (parsed.data !== savedValue) onCommit(parsed.data);
	};
	return (
		<div className="flex flex-col gap-2">
			{harness ? (
				<Textarea
					label={label}
					value={text ?? value}
					invalid={error !== null}
					aria-describedby={hintId}
					rows={4}
					className="text-sm"
					spellCheck={false}
					onChange={(event) => setText(event.target.value)}
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
					value={text ?? value}
					invalid={error !== null}
					aria-describedby={hintId}
					onChange={(event) => setText(event.target.value)}
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
