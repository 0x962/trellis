import type { Persona, PersonaKind } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import type { CliContext } from "../context.ts";
import { contextOf } from "../context.ts";
import { notFound, usageError } from "../errors.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec } from "../output.ts";

export const kinds: PersonaKind[] = ["builder", "reviewer", "manager"];

export const personaList: ListSpec<Persona> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "kind", value: (row) => row.kind },
		{ name: "name", value: (row) => cell(row.name) },
	],
	identifier: (row) => row.id,
};

// The instruction has many lines, so it is not a field: `show` prints it
// below the block, the way `show` prints a ticket description.
const personaRecord: RecordSpec<Persona> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "kind", value: (row) => row.kind },
		{ name: "created", value: (row) => shortZonedDateTime(row.createdAt) },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.id,
};

// A persona ref is an id or a name. An id reads one persona; a name reads
// the list and matches without regard to letter case.
const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const resolvePersona = async (ctx: CliContext, ref: string): Promise<Persona> => {
	if (ulid.test(ref.toUpperCase())) return clientOf(ctx).personas.get({ id: ref.toUpperCase() });
	const personas = await clientOf(ctx).personas.list({});
	const persona = personas.find((row) => row.name.toLowerCase() === ref.toLowerCase());
	if (persona === undefined) throw notFound("persona", ref);
	return persona;
};

const list = defineCommand({
	meta: { name: "list", description: "List the personas" },
	args: { kind: { type: "string", description: `Keep one kind: ${kinds.join(", ")}` } },
	async run(context) {
		const ctx = contextOf(context);
		const { kind } = context.args;
		if (kind !== undefined && !kinds.includes(kind as PersonaKind))
			throw usageError(`--kind takes one of ${kinds.join(", ")}, not "${kind}"`);
		const personas = await clientOf(ctx).personas.list({});
		const rows = kind === undefined ? personas : personas.filter((persona) => persona.kind === kind);
		printList(ctx.out, ctx.format, rows, personaList);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show one persona and its instruction" },
	args: { persona: { type: "positional", required: true, description: "Persona id or name" } },
	async run(context) {
		const ctx = contextOf(context);
		const persona = await resolvePersona(ctx, context.args.persona);
		printRecord(ctx.out, ctx.format, persona, personaRecord);
		if (ctx.format.mode === "table") ctx.out.write(`\n${persona.instruction}\n`);
	},
});

export default defineCommand({
	meta: { name: "personas", description: "List personas or show one persona" },
	subCommands: { list, show },
});
