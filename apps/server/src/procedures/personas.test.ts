import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ulidPattern } from "@trellis/api";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());

describe("personas procedures", () => {
	test("REST creates a persona and RPC reads and updates the same saved row", async () => {
		const created = await t.api("/api/personas", {
			method: "POST",
			body: { name: "  Reviewer  ", instruction: "  Read the diff.\nReport defects.  " },
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({ name: "Reviewer", instruction: "Read the diff.\nReport defects." });
		expect(created.body.id).toMatch(ulidPattern);
		expect(await t.client.personas.list({})).toContainEqual(created.body);
		const updated = await t.client.personas.update({
			id: created.body.id,
			name: "  Code reviewer  ",
			instruction: "  Read the changed files.  ",
		});
		expect(updated).toMatchObject({
			id: created.body.id,
			name: "Code reviewer",
			instruction: "Read the changed files.",
			createdAt: created.body.createdAt,
		});
		const listed = await t.api("/api/personas", { actor: null });
		expect(listed.status).toBe(200);
		expect(listed.body).toContainEqual(updated);
	});

	test("RPC creates a persona and REST updates the same saved row", async () => {
		const created = await t.client.personas.create({ name: "Builder", instruction: "Make the tests pass." });
		const updated = await t.api(`/api/personas/${created.id}`, {
			method: "PATCH",
			body: { name: "Frontend builder", instruction: "Build accessible controls." },
		});
		expect(updated.status).toBe(200);
		expect(updated.body).toMatchObject({
			id: created.id,
			name: "Frontend builder",
			instruction: "Build accessible controls.",
		});
		expect(await t.client.personas.list({})).toContainEqual(updated.body);
	});

	test("create and update require an actor", async () => {
		for (const [method, path] of [
			["POST", "/api/personas"],
			["PATCH", "/api/personas/01ARZ3NDEKTSV4RRFFQ69G5FAV"],
		]) {
			const response = await t.api(path!, {
				method,
				actor: null,
				body: { name: "Reviewer", instruction: "Read the diff." },
			});
			expect(response.status).toBe(400);
			expect(response.body.code).toBe("ACTOR_REQUIRED");
		}
	});

	test("invalid create and update fields leave the saved personas unchanged", async () => {
		const created = await t.client.personas.create({ name: "Stable", instruction: "Keep this instruction." });
		const before = await t.client.personas.list({});
		for (const body of [
			{ name: " ", instruction: "Read the diff." },
			{ name: "Reviewer", instruction: "\n\t " },
			{ name: "n".repeat(121), instruction: "Read the diff." },
			{ name: "Reviewer", instruction: "i".repeat(200_001) },
			{ name: "Reviewer" },
			{ instruction: "Read the diff." },
		]) {
			for (const [method, path] of [
				["POST", "/api/personas"],
				["PATCH", `/api/personas/${created.id}`],
			]) {
				const response = await t.api(path!, { method, body });
				expect(response.status).toBe(400);
				expect(response.body.code).toBe("INPUT_VALIDATION_FAILED");
			}
		}
		expect(await t.client.personas.list({})).toEqual(before);
	});

	test("REST update reports a missing persona", async () => {
		const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
		const response = await t.api(`/api/personas/${id}`, {
			method: "PATCH",
			body: { name: "Missing", instruction: "Read the diff." },
		});
		expect(response.status).toBe(404);
		expect(response.body).toMatchObject({ code: "NOT_FOUND", data: { kind: "persona", ref: id } });
	});
});
