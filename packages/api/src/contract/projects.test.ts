import { expect, test } from "bun:test";
import { accepts } from "../../test/standardSchema.ts";
import { projects } from "./projects.ts";

// A root owns the key and the ticket counter; a child takes its root's key
// and is addressed by slug. The key grammar is `^[A-Z][A-Z0-9]{1,9}$`.
test("projects.create requires a key without a parent and forbids one with a parent", async () => {
	const schema = projects.create["~orpc"].inputSchema;
	expect(await accepts(schema, { key: "CDE", name: "Code" })).toBe(true);
	expect(await accepts(schema, { parent: "CDE", name: "Web", slug: "web" })).toBe(true);
	expect(await accepts(schema, { name: "Web" })).toBe(false);
	expect(await accepts(schema, { parent: "CDE", key: "WEB", name: "Web" })).toBe(false);
	expect(await accepts(schema, { key: "cde", name: "Code" })).toBe(false);
});
