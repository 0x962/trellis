import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());

describe("persona kinds and deletion", () => {
	test("each kind survives create, update, and a fresh read", async () => {
		for (const kind of ["builder", "reviewer", "manager"] as const) {
			const created = await t.api("/api/personas", {
				method: "POST",
				body: { name: `${kind} persona`, kind, instruction: "Read the task." },
			});
			expect(created.status).toBe(201);
			expect(created.body.kind).toBe(kind);
			const changed = await t.api(`/api/personas/${created.body.id}`, {
				method: "PATCH",
				body: { name: `${kind} renamed`, kind: "manager", instruction: "Manage the task." },
			});
			expect(changed.status).toBe(200);
			expect(changed.body.kind).toBe("manager");
			const listed = await t.client.personas.list({});
			expect(listed.find((p) => p.id === created.body.id)).toMatchObject({
				kind: "manager",
				instruction: "Manage the task.",
			});
		}
	});

	test("an invalid kind never creates a persona", async () => {
		const before = await t.client.personas.list({});
		const result = await t.api("/api/personas", {
			method: "POST",
			body: { name: "Invalid", kind: "supervisor", instruction: "Read." },
		});
		expect(result.status).toBe(400);
		expect(await t.client.personas.list({})).toEqual(before);
	});

	test("delete requires an actor and removes only the selected persona", async () => {
		const created = await t.client.personas.create({ name: "Temporary", instruction: "Read." });
		const kept = await t.client.personas.create({ name: "Keep", instruction: "Stay." });
		const denied = await t.api(`/api/personas/${created.id}`, { method: "DELETE", actor: null });
		expect(denied.status).toBe(400);
		const deleted = await t.api(`/api/personas/${created.id}`, { method: "DELETE" });
		expect(deleted.status).toBe(200);
		expect(deleted.body).toEqual({ id: created.id });
		const listed = await t.client.personas.list({});
		expect(listed.some((p) => p.id === created.id)).toBe(false);
		expect(listed).toContainEqual(kept);
		expect((await t.api(`/api/personas/${created.id}`, { method: "DELETE" })).status).toBe(404);
	});
});

describe("persona color and description", () => {
	test("a persona keeps its color and description through create, update, and a fresh read", async () => {
		const created = await t.api("/api/personas", {
			method: "POST",
			body: {
				name: "Docs writer",
				kind: "builder",
				color: "agent",
				description: "  Writes the reference pages.  ",
				instruction: "Write the docs.",
			},
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({ color: "agent", description: "Writes the reference pages." });
		const changed = await t.client.personas.update({
			id: created.body.id,
			name: "Docs writer",
			color: "success",
			description: "",
			instruction: "Write the docs.",
		});
		expect(changed).toMatchObject({ color: "success", description: "" });
		expect(await t.client.personas.list({})).toContainEqual(changed);
	});

	test("a persona without a color takes accent and an empty description", async () => {
		const created = await t.client.personas.create({ name: "Plain", instruction: "Work." });
		expect(created).toMatchObject({ color: "accent", description: "" });
	});

	test("a raw color value and an oversized description are refused", async () => {
		const before = await t.client.personas.list({});
		for (const body of [
			{ name: "Bad", instruction: "Work.", color: "#ff0000" },
			{ name: "Bad", instruction: "Work.", color: "purple" },
			{ name: "Bad", instruction: "Work.", description: "d".repeat(2001) },
		]) {
			const response = await t.api("/api/personas", { method: "POST", body });
			expect(response.status).toBe(400);
			expect(response.body.code).toBe("INPUT_VALIDATION_FAILED");
		}
		expect(await t.client.personas.list({})).toEqual(before);
	});
});
