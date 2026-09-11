import { fail } from "../fail";
import { os } from "../implementer";
import { isoNow, newId } from "../state";

export const personas = {
	list: os.personas.list.handler(({ context }) =>
		[...context.state.personas.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
	),
	create: os.personas.create.handler(({ context, input }) => {
		const at = isoNow();
		const persona = { ...input, id: newId(), createdAt: at, updatedAt: at };
		context.state.personas.set(persona.id, persona);
		context.bus.emit("personas.changed", { id: persona.id });
		context.resHeaders.set("location", `/api/personas/${persona.id}`);
		return persona;
	}),
	update: os.personas.update.handler(({ context, input }) => {
		const existing = context.state.personas.get(input.id);
		if (existing === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
		const persona = { ...existing, ...input, updatedAt: isoNow() };
		context.state.personas.set(persona.id, persona);
		context.bus.emit("personas.changed", { id: persona.id });
		return persona;
	}),
};
