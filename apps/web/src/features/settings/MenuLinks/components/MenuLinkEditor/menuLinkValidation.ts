import { type MenuLink, type MenuLinkIcon, MenuLinkSchema } from "@trellis/api";

export type MenuLinkField = "label" | "url";

export type MenuLinkDraft = {
	id: string;
	label: string;
	icon: MenuLinkIcon;
	url: string;
};

type MenuLinkParseResult =
	| { success: true; data: MenuLink }
	| {
			success: false;
			errors: Partial<Record<MenuLinkField, string>>;
			firstInvalid: MenuLinkField;
	  };

export function parseMenuLink(draft: MenuLinkDraft): MenuLinkParseResult {
	const parsed = MenuLinkSchema.safeParse(draft);
	if (parsed.success) return parsed;
	const errors: Partial<Record<MenuLinkField, string>> = {};
	for (const issue of parsed.error.issues) {
		const field = issue.path[0];
		if ((field === "label" || field === "url") && errors[field] === undefined) errors[field] = issue.message;
	}
	const firstInvalid = parsed.error.issues
		.map((issue) => issue.path[0])
		.find((field) => field === "label" || field === "url")!;
	return { success: false, errors, firstInvalid };
}
