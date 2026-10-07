import { ActorHeaderSchema } from "@trellis/api";
import { Button, FormStatus, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { saveActorName } from "../../../lib/identity";

export type NameStepProps = {
	// The name the field starts with: the server's `defaultActorName`.
	suggested: string;
	onDone: () => void;
};

// Step 1 of the first run. Nothing is stored until Continue, which stores
// the name on the server and in this browser.
export function NameStep({ suggested, onDone }: NameStepProps) {
	const app = useApp();
	const [name, setName] = useState(suggested);
	const [pending, setPending] = useState(false);
	const trimmed = name.trim();
	const valid = ActorHeaderSchema.safeParse(`human:${trimmed}`).success;
	const nameError = valid
		? undefined
		: trimmed === ""
			? "Enter your name."
			: "Use printable ASCII characters without a colon.";

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		await saveActorName(app, trimmed);
		onDone();
	};

	return (
		<form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-lg font-semibold text-fg">Enter your name</h1>
				<p className="text-sm text-fg-muted">
					trellis records this name as the actor of each change you make. Agents use their own names.
				</p>
			</div>
			<Input
				label="Your name"
				value={name}
				error={nameError}
				autoFocus
				autoComplete="off"
				spellCheck={false}
				onChange={(event) => setName(event.target.value)}
			/>
			<FormStatus status={pending ? "saving" : "idle"} />
			<Button
				type="submit"
				variant="primary"
				size="md"
				kbd="↵"
				disabled={!valid}
				processing={pending}
				className="w-full"
			>
				Continue
			</Button>
		</form>
	);
}
