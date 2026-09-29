import { expect, test } from "bun:test";
import { ActorHeaderSchema, ActorHeaderStringSchema } from "../refs.ts";
import { ActorRefSchema, ActorSchema, DefaultActorSchema } from "./actor.ts";
import { SettingsSchema, SettingsSetInputSchema } from "./settings/settings.ts";
import { ListQuerySchema } from "./ticket.ts";

const names = [`${"a".repeat(64)}-first`, `${"a".repeat(64)}-second`, "b".repeat(4096)];

for (const name of names) {
	test(`actor schemas preserve a complete ${name.length}-character name`, () => {
		for (const kind of ["human", "agent"] as const) {
			const actor = { kind, name };
			const header = `${kind}:${name}`;
			expect(ActorHeaderSchema.parse(header)).toEqual(actor);
			expect(ActorHeaderStringSchema.parse(header)).toBe(header);
			expect(ActorHeaderSchema.canonicalize(header)).toBe(header);
			expect(ActorRefSchema.parse(actor)).toEqual(actor);
			expect(
				ActorSchema.parse({ ...actor, firstSeenAt: "2026-09-29T00:00:00.000Z", lastSeenAt: "2026-09-29T00:00:00.000Z" })
					.name,
			).toBe(name);
			expect(DefaultActorSchema.parse({ ...actor, stored: true }).name).toBe(name);
			expect(ListQuerySchema.parse({ actor: header }).actor).toBe(header);
		}
		expect(ListQuerySchema.parse({ actor: name }).actor).toBe(name);
		expect(SettingsSchema.parse({ defaultActorName: name }).defaultActorName).toBe(name);
		expect(SettingsSetInputSchema.parse({ defaultActorName: name }).defaultActorName).toBe(name);
	});
}

test("actor headers reject empty names, extra colons, control characters, and non-ASCII characters", () => {
	for (const name of ["", "a:b", "a\n", "a\r", "a\r\n", "a\t", "a\0", "a\x7f", "José"]) {
		expect(ActorHeaderSchema.safeParse(`human:${name}`).success).toBe(false);
		expect(ListQuerySchema.safeParse({ actor: `human:${name}` }).success).toBe(false);
	}
	for (const header of ["system:trellis", "robot:test", "human", "name"]) {
		expect(ActorHeaderSchema.safeParse(header).success).toBe(false);
	}
});
