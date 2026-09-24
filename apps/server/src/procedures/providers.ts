import type { Provider } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const providers = os.providers.router({
	models: os.providers.models.handler(({ context, input }) => call(context, "providers.models", input)),
	publicModels: os.providers.publicModels.handler(({ context, input }) =>
		call(context, "providers.publicModels", input),
	),
	check: os.providers.check.handler(({ context, input }) => call(context, "providers.check", input)),
	list: os.providers.list.handler(({ context, input }) => call(context, "providers.list", input)),
	get: os.providers.get.handler(({ context, input }) => call(context, "providers.get", input)),
	create: os.providers.create.handler(async ({ context, input }) => {
		const provider = await call<Provider>(context, "providers.create", input);
		setLocation(context, `/api/providers/${provider.id}`);
		return provider;
	}),
	update: os.providers.update.handler(({ context, input }) => call(context, "providers.update", input)),
	delete: os.providers.delete.handler(({ context, input }) => call(context, "providers.delete", input)),
});
