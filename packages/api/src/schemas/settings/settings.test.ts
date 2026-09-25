import { expect, test } from "bun:test";
import { MenuLinkSchema, SettingsSetInputSchema } from "./settings";

const link = {
	id: "83a7ed37-b3f4-4ba2-8e10-b1f91eedb41f",
	label: " Actions ",
	icon: "GithubLogo",
	url: "https://github.com/0x962/trellis/actions",
};

test("menu links trim labels and preserve order and identity", () => {
	const other = { ...link, id: "128f08be-daf8-4999-abcc-27e20a5d81bd", icon: "BookOpen" };
	const parsed = SettingsSetInputSchema.parse({ defaultActorName: "test", menuLinks: [other, link] });
	expect(parsed.menuLinks?.map((item) => item.id)).toEqual([other.id, link.id]);
	expect(parsed.menuLinks?.[0]?.label).toBe("Actions");
});

for (const url of [
	"",
	"not a URL",
	"http://example.com",
	"javascript:alert(1)",
	"data:text/html,hello",
	"file:///tmp/page",
	"//example.com",
	"https://user:password@example.com",
	"https://user@example.com",
	"https://:password@example.com",
]) {
	test(`menu links reject ${url}`, () => expect(MenuLinkSchema.safeParse({ ...link, url }).success).toBe(false));
}

test("menu links reject empty labels, unknown icons, invalid IDs, and duplicate IDs", () => {
	for (const patch of [{ label: "  " }, { icon: "Unknown" }, { id: "" }])
		expect(MenuLinkSchema.safeParse({ ...link, ...patch }).success).toBe(false);
	expect(SettingsSetInputSchema.safeParse({ defaultActorName: "test", menuLinks: [link, link] }).success).toBe(false);
});

test("older settings clients can omit menu links", () => {
	expect(SettingsSetInputSchema.safeParse({ defaultActorName: "test" }).success).toBe(true);
});
