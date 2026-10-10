import type { Role } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const roles = os.roles.router({
	list: os.roles.list.handler(({ context, input }) => call(context, "roles.list", input)),
	get: os.roles.get.handler(({ context, input }) => call(context, "roles.get", input)),
	create: os.roles.create.handler(async ({ context, input }) => {
		const role = await call<Role>(context, "roles.create", input);
		setLocation(context, `/api/roles/${role.id}`);
		return role;
	}),
	update: os.roles.update.handler(({ context, input }) => call(context, "roles.update", input)),
	delete: os.roles.delete.handler(({ context, input }) => call(context, "roles.delete", input)),
});
