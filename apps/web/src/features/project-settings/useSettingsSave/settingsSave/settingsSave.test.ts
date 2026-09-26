import { expect, test } from "bun:test";
import { settingsSave } from "./settingsSave";

test("a blur saves only its field and leaves another draft unsaved", async () => {
	const calls: object[] = [];
	const store = settingsSave({ name: "Old", description: "" }, async (patch) => {
		calls.push(patch);
	});
	store.setField("name", "New");
	store.setField("description", "Draft");
	await store.saveField("name");
	expect(calls).toEqual([{ name: "New" }]);
	expect(store.getSnapshot()).toEqual({
		value: { name: "New", description: "Draft" },
		status: { pending: false, dirty: true, error: null },
	});
});

test("overlapping blurs preserve their order and edits made during a request", async () => {
	const first = Promise.withResolvers<void>();
	const calls: object[] = [];
	const store = settingsSave({ name: "Old" }, async (patch) => {
		calls.push(patch);
		if (calls.length === 1) await first.promise;
	});
	store.setField("name", "First");
	const one = store.saveField("name");
	await Promise.resolve();
	store.setField("name", "Old");
	const two = store.saveField("name");
	store.setField("name", "Still typing");
	expect(calls).toEqual([{ name: "First" }]);
	expect(store.getSnapshot().status.pending).toBe(true);
	first.resolve();
	await Promise.all([one, two]);
	expect(calls).toEqual([{ name: "First" }, { name: "Old" }]);
	expect(store.getSnapshot().value.name).toBe("Still typing");
	expect(store.getSnapshot().status.dirty).toBe(true);
	await store.saveField("name");
	expect(store.getSnapshot().status).toEqual({ pending: false, dirty: false, error: null });
});

test("a failed field keeps its error after another field saves and retries only on blur", async () => {
	let fail = true;
	const store = settingsSave({ name: "Old", description: "" }, async (patch) => {
		if (patch.name && fail) throw new Error("Name is taken");
	});
	store.setField("name", "New");
	await store.saveField("name");
	store.setField("description", "Saved text");
	await store.saveField("description");
	expect(store.getSnapshot().status).toEqual({ pending: false, dirty: true, error: "Name is taken" });
	fail = false;
	await store.saveField("name");
	expect(store.getSnapshot().status).toEqual({ pending: false, dirty: false, error: null });
});

test("an unchanged field sends no request", async () => {
	let calls = 0;
	const store = settingsSave({ name: "Old" }, async () => {
		calls += 1;
	});
	await store.saveField("name");
	expect(calls).toBe(0);
});

test("duplicate blur events share a pending write and do not retry its failure", async () => {
	const response = Promise.withResolvers<void>();
	let calls = 0;
	const store = settingsSave({ repos: ["example/one"] }, async () => {
		calls += 1;
		await response.promise;
	});
	store.setField("repos", ["example/one", "example/two"]);
	const first = store.saveField("repos");
	const second = store.saveField("repos");
	await Promise.resolve();
	response.reject(new Error("Save failed"));
	await Promise.all([first, second]);
	expect(calls).toBe(1);
	expect(store.getSnapshot().status).toEqual({ pending: false, dirty: true, error: "Save failed" });
	await store.saveField("repos");
	expect(calls).toBe(2);
});
