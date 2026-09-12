import { Input } from "@trellis/ui";
import { type ReactNode, useState } from "react";

export type TemplateInputProps = {
	label: string;
	// The saved template. The input keeps its own draft while the person
	// types, and hands a changed draft back on blur through `onCommit`.
	value: string;
	hint: ReactNode;
	// The names in the draft that no variable of this template kind has.
	unknown: (value: string) => string[];
	// The message for an empty draft. Left out, an empty draft is allowed and
	// stands for the default of the template.
	requiredMessage?: string;
	onCommit: (value: string) => void;
};

// One command template with its hint and its validation message. A draft
// with an unknown variable, or an empty draft where one is required, stays
// in the input with the message under it and reaches nobody.
export function TemplateInput({ label, value, hint, unknown, requiredMessage, onCommit }: TemplateInputProps) {
	const [draft, setDraft] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const commit = () => {
		const next = (draft ?? value).trim();
		if (next === "" && requiredMessage !== undefined) {
			setMessage(requiredMessage);
			return;
		}
		const names = unknown(next);
		if (names.length > 0) {
			setMessage(`Unknown variables: ${names.join(", ")}`);
			return;
		}
		setMessage(null);
		setDraft(null);
		if (next !== value) onCommit(next);
	};
	return (
		<>
			<Input
				label={label}
				value={draft ?? value}
				invalid={message !== null}
				className="text-sm"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
			/>
			<p className="text-sm text-fg-muted">{hint}</p>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
		</>
	);
}
