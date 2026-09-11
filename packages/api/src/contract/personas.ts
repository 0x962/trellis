import { z } from "zod";
import {
	PersonaCreateInputSchema,
	PersonaDeleteInputSchema,
	PersonaSchema,
	PersonaUpdateInputSchema,
} from "../schemas/persona.ts";
import { base } from "./base.ts";

export const personas = {
	list: base
		.route({ method: "GET", path: "/personas", summary: "List personas" })
		.input(z.strictObject({}))
		.output(z.array(PersonaSchema)),
	create: base
		.route({ method: "POST", path: "/personas", successStatus: 201, summary: "Create a persona" })
		.input(PersonaCreateInputSchema)
		.output(PersonaSchema),
	delete: base
		.route({ method: "DELETE", path: "/personas/{id}", summary: "Delete a persona" })
		.input(PersonaDeleteInputSchema)
		.output(PersonaDeleteInputSchema),
	update: base
		.route({ method: "PATCH", path: "/personas/{id}", summary: "Update a persona" })
		.input(PersonaUpdateInputSchema)
		.output(PersonaSchema),
};
