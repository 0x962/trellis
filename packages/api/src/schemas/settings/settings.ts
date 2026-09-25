import { z } from "zod";

export const MenuLinkIconSchema = z.enum(["Link", "GithubLogo", "Play", "Globe", "BookOpen", "ChartLine"]);
export type MenuLinkIcon = z.infer<typeof MenuLinkIconSchema>;

export const MenuLinkSchema = z.strictObject({
	id: z.uuid(),
	label: z.string().trim().min(1, "Enter a label.").max(80),
	icon: MenuLinkIconSchema,
	url: z.url({ protocol: /^https$/ }).refine((value) => {
		if (!URL.canParse(value)) return false;
		const url = new URL(value);
		return url.username === "" && url.password === "";
	}, "Use an HTTPS URL without credentials."),
});
export type MenuLink = z.infer<typeof MenuLinkSchema>;

export const SettingsSchema = z.object({
	menuLinks: z
		.array(MenuLinkSchema)
		.refine((links) => new Set(links.map((link) => link.id)).size === links.length, "Use a unique ID for each link.")
		.optional(),
	notifications: z.object({ sound: z.boolean(), native: z.boolean(), volume: z.number().min(0).max(100) }).optional(),
	defaultActorName: z.string().max(64, "Enter a default name of 64 characters or less."),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsSetInputSchema = z.strictObject(SettingsSchema.shape);
export type SettingsSetInput = z.input<typeof SettingsSetInputSchema>;
