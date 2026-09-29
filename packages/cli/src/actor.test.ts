import { expect, test } from "bun:test";
import { ActorHeaderSchema } from "@trellis/api";
import { cleanName, resolveActor } from "./actor.ts";

const names = [`${"a".repeat(64)}-first`, `${"a".repeat(64)}-second`, "b".repeat(4096)];
const input = { env: {}, gitUserName: () => "", osUser: () => "local" };

test("explicit and derived names retain distinct suffixes after the first 64 characters", () => {
	for (const name of names) {
		const resolutions = [
			resolveActor({ ...input, as: `human:${name}` }),
			resolveActor({ ...input, as: name }),
			resolveActor({ ...input, env: { TRELLIS_ACTOR: `agent:${name}` } }),
			resolveActor({ ...input, gitUserName: () => name }),
			resolveActor({ ...input, osUser: () => name }),
		];
		for (const result of resolutions) {
			expect(result.name).toBe(name);
			expect(result.actor).toBe(`${result.kind}:${name}`);
			expect(ActorHeaderSchema.parse(result.actor)).toEqual({ name, kind: result.kind });
		}
	}
	expect(new Set(names.map(cleanName)).size).toBe(names.length);
});

test("derived names retain ASCII normalization without truncation", () => {
	const suffix = "a".repeat(100);
	expect(cleanName(`  José:\t${suffix}\n`)).toBe(`Jose${suffix}`);
});

test("explicit names reject unsafe header characters and invalid kinds", () => {
	for (const value of [
		"human:",
		"system:test",
		"human:a:b",
		"human:a\n",
		"human:a\r",
		"human:a\t",
		"human:a\0",
		"human:a\x7f",
		"human:José",
	]) {
		expect(() => resolveActor({ ...input, as: value })).toThrow();
		expect(() => resolveActor({ ...input, env: { TRELLIS_ACTOR: value } })).toThrow();
	}
});
