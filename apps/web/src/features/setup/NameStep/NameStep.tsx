import { ActorHeaderSchema } from "@trellis/api";
import { Button, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { setActorName } from "../../../lib/actor";

export type NameStepProps = {
	// The name the field starts with: the machine's user name.
	suggested: string;
	onDone: () => void;
};

// Step 1 of the first run. Nothing is stored until Continue.
export function NameStep({ suggested, onDone }: NameStepProps) {
	const [name, setName] = useState(suggested);
	const valid = ActorHeaderSchema.safeParse(`human:${name.trim()}`).success;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setActorName(name.trim());
		onDone();
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-semibold text-fg">What should we call you?</h1>
				<p className="text-fg-muted">Every ticket you touch is attributed to this name. Agents sign with their own.</p>
			</div>
			<Input
				label="Your name"
				value={name}
				autoFocus
				autoComplete="off"
				spellCheck={false}
				onChange={(event) => setName(event.target.value)}
			/>
			<Button type="submit" variant="primary" disabled={!valid} className="self-end">
				Continue
			</Button>
		</form>
	);
}
