import { expect, test } from "bun:test";
import {
	ResourceAddInputSchema,
	ResourceDocNameSchema,
	ResourceNameSchema,
	ResourceSchema,
	ResourceUpdateInputSchema,
	ResourceUrlSchema,
} from "./resource";

const id = "01M3NZCN9DYG8MGYQX0DBC2WHH";
const name = "資料".repeat(400);
const url = `https://example.com/resource?value=${"abcdef".repeat(2000)}#end`;

test("accepts complete names and URLs in resource inputs and outputs", () => {
	expect(ResourceNameSchema.parse(` ${name} `)).toBe(name);
	expect(ResourceDocNameSchema.parse(name)).toBe(name);
	expect(ResourceUrlSchema.parse(url)).toBe(url);
	for (const kind of ["doc", "link", "image", "file"] as const) {
		const fields = kind === "doc" ? { body: "Body" } : kind === "link" ? { url } : { file: new File(["x"], "x") };
		expect(ResourceAddInputSchema.parse({ epic: id, kind, name, ...fields }).name).toBe(name);
	}
	expect(ResourceUpdateInputSchema.parse({ id, name }).name).toBe(name);
	expect(
		ResourceSchema.parse({
			id,
			epicId: id,
			kind: "link",
			name,
			url,
			body: null,
			blob: null,
			ticketId: null,
			pullRequestNumber: null,
			actor: { kind: "human", name: "Tester" },
			createdAt: "2026-09-29T20:00:00.000Z",
			updatedAt: "2026-09-29T20:00:00.000Z",
		}),
	).toMatchObject({ name, url });
});

test("retains resource name, URL, and kind validation", () => {
	expect(ResourceDocNameSchema.parse(" ")).toBe("");
	expect(ResourceNameSchema.safeParse(" ").success).toBe(false);
	for (const value of [
		"",
		"not a URL",
		"javascript:alert(1)",
		"data:text/html,hello",
		"file:///tmp/file",
		"ftp://example.com",
	]) {
		expect(ResourceUrlSchema.safeParse(value).success).toBe(false);
	}
	expect(ResourceAddInputSchema.safeParse({ epic: id, kind: "unknown", name }).success).toBe(false);
	expect(ResourceUpdateInputSchema.safeParse({ id, url }).success).toBe(false);
});
