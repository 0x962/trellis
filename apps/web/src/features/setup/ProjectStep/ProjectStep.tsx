import { Button, Input, type ProjectColor, ProjectColorField, TicketId } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { suggestKey } from "../../../lib/projectKey";

export type ProjectStepProps = {
	// The keys already in use.
	taken: readonly string[];
	// The names of the root projects. A new root takes none of them, compared
	// without case.
	takenNames: readonly string[];
	// The colors the other projects hold. A new project takes a free one.
	takenColors: readonly ProjectColor[];
	onCreate: (input: { key: string; name: string; color: ProjectColor | null }) => Promise<void>;
};

// A key is 2 to 5 characters: a letter, then letters or digits.
const keyPattern = /^[A-Z][A-Z0-9]{1,4}$/;

// Step 2 of the first run, and the form behind "New project" later. The key
// follows the name until the person edits it. Every edit is validated live,
// and a valid key shows the first ticket ID it gives.
export function ProjectStep({ taken, takenNames, takenColors, onCreate }: ProjectStepProps) {
	const [name, setName] = useState("");
	const [color, setColor] = useState<ProjectColor | null>(null);
	const [editedKey, setEditedKey] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const trimmed = name.trim();
	const nameError = takenNames.some((taken) => taken.toLowerCase() === trimmed.toLowerCase())
		? `A project named ${trimmed} exists.`
		: null;
	const key = editedKey ?? (trimmed === "" ? "" : suggestKey(name, taken));
	const keyError =
		key === ""
			? null
			: !keyPattern.test(key)
				? "A key is 2 to 5 characters: a letter, then letters or digits."
				: taken.includes(key)
					? `Another project uses the key ${key}.`
					: null;
	const ready = trimmed !== "" && nameError === null && key !== "" && keyError === null && !pending;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		await onCreate({ key, name: trimmed, color });
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-lg font-semibold text-fg">
					{taken.length === 0 ? "Create your first project" : "New project"}
				</h1>
				<p className="text-sm text-fg-muted">
					A project has a key. Each ticket ID in the project and its sub-projects starts with that key.
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
				{nameError !== null && <p className="text-xs text-danger">{nameError}</p>}
			</div>
			<div className="flex flex-col gap-1">
				<Input
					label="Key"
					value={key}
					invalid={keyError !== null}
					autoComplete="off"
					spellCheck={false}
					className="w-28 uppercase"
					onChange={(event) => setEditedKey(event.target.value.toUpperCase())}
				/>
				{keyError !== null ? (
					<p className="text-xs text-danger">{keyError}</p>
				) : key === "" ? (
					<p className="text-xs text-fg-muted">trellis takes the key from the name. You can edit the key.</p>
				) : (
					<p data-key-preview="" className="flex items-center gap-1.5 text-xs text-fg-muted">
						The first ticket ID is
						<TicketId id={`${key}-1`} className="rounded-sm border border-border bg-surface px-1" />
					</p>
				)}
			</div>
			<ProjectColorField value={color} taken={takenColors} onValueChange={setColor} />
			<Button type="submit" variant="primary" size="md" kbd="↵" disabled={!ready} className="w-full">
				Create
			</Button>
		</form>
	);
}
