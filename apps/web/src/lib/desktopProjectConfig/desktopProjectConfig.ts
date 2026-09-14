import { ProjectManagerConfigSchema } from "@trellis/api";

export const desktopProjectConfig = () =>
	(window as Window & { trellisDesktop?: unknown }).trellisDesktop
		? ProjectManagerConfigSchema.parse({
				personaId: null,
				concurrency: 3,
				directory: "",
				ade: "native",
				trustedDirectory: false,
			})
		: undefined;
