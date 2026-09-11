import { fail } from "../fail";
import { os } from "../implementer";
import { isoNow, newId } from "../state";

export const personas = {
	delete: os.personas.delete.handler(({ context, input }) => {
		if (!context.state.personas.has(input.id)) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
		context.state.personas.delete(input.id);
		context.bus.emit("personas.changed", { id: input.id });
		return input;
	}),
	list: os.personas.list.handler(({ context }) =>
		[...context.state.personas.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
	),
	create: os.personas.create.handler(({ context, input }) => {
		const at = isoNow();
		const persona = { ...input, kind: input.kind ?? "builder", id: newId(), createdAt: at, updatedAt: at };
		context.state.personas.set(persona.id, persona);
		context.bus.emit("personas.changed", { id: persona.id });
		context.resHeaders.set("location", `/api/personas/${persona.id}`);
		return persona;
	}),
	update: os.personas.update.handler(({ context, input }) => {
		const existing = context.state.personas.get(input.id);
		if (existing === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
		const persona = { ...existing, ...input, kind: input.kind ?? existing.kind, updatedAt: isoNow() };
		context.state.personas.set(persona.id, persona);
		context.bus.emit("personas.changed", { id: persona.id });
		return persona;
	}),
};
