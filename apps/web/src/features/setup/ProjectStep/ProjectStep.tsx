import { Button, Input } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { suggestKey } from "../../../lib/projectKey";

export type ProjectStepProps = {
	// The keys already in use.
	taken: readonly string[];
	// The names of the root projects. A new root takes none of them, compared
	// without case.
	takenNames: readonly string[];
	onCreate: (input: { key: string; name: string }) => Promise<void>;
};

// A key is 2 to 5 characters: a letter, then letters or digits.
const keyPattern = /^[A-Z][A-Z0-9]{1,4}$/;

// Step 2 of the first run, and the form behind "New project" later. The key
// follows the name until the person edits it. Every edit is validated live.
export function ProjectStep({ taken, takenNames, onCreate }: ProjectStepProps) {
	const [name, setName] = useState("");
	const [editedKey, setEditedKey] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const trimmed = name.trim();
	const nameError = takenNames.some((taken) => taken.toLowerCase() === trimmed.toLowerCase())
		? `A project named ${trimmed} exists.`
		: null;
	const key = editedKey ?? (trimmed === "" ? "" : suggestKey(name, taken));
	const isTaken = taken.includes(key);
	const keyError =
		key === ""
			? null
			: !keyPattern.test(key)
				? "A key is 2 to 5 characters: a letter, then letters or digits."
				: isTaken
					? `${key} is taken.`
					: null;
	const ready = trimmed !== "" && nameError === null && key !== "" && keyError === null && !pending;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		await onCreate({ key, name: trimmed });
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-semibold text-fg">
					{taken.length === 0 ? "Create your first project" : "New project"}
				</h1>
				<p className="text-fg-muted">
					A project owns a key. Every ticket in it and under it is numbered with that key.
				</p>
			</div>
			<div className="flex flex-col gap-1">
				<Input
					label="Project name"
					value={name}
					invalid={nameError !== null}
					autoFocus
					autoComplete="off"
					spellCheck={false}
					onChange={(event) => setName(event.target.value)}
				/>
				{nameError !== null && <p className="text-sm text-danger">{nameError}</p>}
			</div>
			<div className="flex flex-col gap-1">
				<Input
					label="Key"
					value={key}
					invalid={keyError !== null}
					autoComplete="off"
					spellCheck={false}
					className="w-28 font-mono uppercase"
					onChange={(event) => setEditedKey(event.target.value.toUpperCase())}
				/>
				{keyError !== null ? (
					<p className="text-sm text-danger">{keyError}</p>
				) : (
					<p className="text-sm text-fg-muted">
						{key === ""
							? "The key comes from the name. Edit it if you like."
							: `Tickets will be numbered ${key}-1, ${key}-2 …`}
					</p>
				)}
			</div>
			<Button type="submit" variant="primary" disabled={!ready} className="self-end">
				Create
			</Button>
		</form>
	);
}
