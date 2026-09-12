import type { Persona } from "@trellis/api";
import { Button, Command, type CommandGroup, Popover } from "@trellis/ui";
import { useRef, useState } from "react";
import { personaKinds } from "../../../../personas/PersonasPage/kinds";

type PersonaSelectProps = { personas: Persona[]; value: string | null; onChange: (personaId: string | null) => void };

// The id of the "No persona" option. A persona id is a ULID, so no persona
// takes this id.
const NONE = "none";

// Picks the persona of a step. The search field matches the name and the
// kind. "No persona" leads the list, so a person can clear the choice.
export function PersonaSelect({ personas, value, onChange }: PersonaSelectProps) {
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const selected = personas.find((persona) => persona.id === value);
	const groups: CommandGroup[] = [
		{ items: [{ id: NONE, label: "No persona" }] },
		...personaKinds
			.map((kind) => ({
				heading: kind.plural,
				items: personas
					.filter((persona) => persona.kind === kind.value)
					.sort((a, b) => a.name.localeCompare(b.name))
					.map((persona) => ({ id: persona.id, label: persona.name, keywords: [persona.kind] })),
			}))
			.filter((group) => group.items.length > 0),
	];
	return (
		<Popover
			label="Select a persona"
			open={open}
			onOpenChange={setOpen}
			initialFocus={input}
			className="w-72 p-0"
			trigger={
				<Button align="start" className="w-full">
					{selected?.name ?? (value === null ? "No persona" : "Missing persona")}
				</Button>
			}
		>
			<Command
				inputRef={input}
				label="Search personas"
				placeholder="Search personas…"
				listClassName="max-h-80 pointer-coarse:[&_[cmdk-item]]:h-11"
				groups={groups}
				empty="No personas found."
				onSelect={(id) => {
					onChange(id === NONE ? null : id);
					setOpen(false);
				}}
			/>
		</Popover>
	);
}
