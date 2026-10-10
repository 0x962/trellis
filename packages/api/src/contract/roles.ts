import { z } from "zod";
import { RoleCreateInputSchema, RoleIdInputSchema, RoleSchema, RoleUpdateInputSchema } from "../schemas/role.ts";
import { base } from "./base.ts";

export const roles = {
	list: base
		.route({ method: "GET", path: "/roles", summary: "List roles" })
		.input(z.strictObject({}))
		.output(z.array(RoleSchema)),
	get: base
		.route({ method: "GET", path: "/roles/{id}", summary: "Read a role" })
		.input(RoleIdInputSchema)
		.output(RoleSchema),
	create: base
		.route({ method: "POST", path: "/roles", successStatus: 201, summary: "Create a role" })
		.input(RoleCreateInputSchema)
		.output(RoleSchema),
	update: base
		.route({ method: "PATCH", path: "/roles/{id}", summary: "Update a role" })
		.input(RoleUpdateInputSchema)
		.output(RoleSchema),
	delete: base
		.route({ method: "DELETE", path: "/roles/{id}", summary: "Delete a role" })
		.input(RoleIdInputSchema)
		.output(RoleIdInputSchema),
};
