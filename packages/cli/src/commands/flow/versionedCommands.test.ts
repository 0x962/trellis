import { expect, test } from "bun:test";
import { executionViewV1Example, legacyDocumentV1Example, publishedDocumentV1Example } from "@trellis/api";
import { run } from "../../index.ts";
import { fixture, legacyRun } from "./testFixture/testFixture.ts";

test("run lists retain mixed engine order and immutable names", async () => {
	const view = { ...executionViewV1Example, id: "00000000000000000000000009" };
	for (const flags of [["--json"], []]) {
		const f = fixture(({ path }) => {
			if (path === "/rpc/flowDocumentsV1/list")
				return [
					{ id: view.id, engine: "langflow" },
					{ id: legacyRun.id, engine: "legacy" },
				];
			if (path === "/rpc/flowDocumentsV1/view") return view;
			if (path === "/rpc/flowExecutions/get") return legacyRun;
			throw new Error(path);
		}, true);
		expect(await run(["flow", "run", "list", ...flags], f.deps)).toBe(0);
		if (flags.length) expect(JSON.parse(f.text())).toEqual([view, legacyRun]);
		else expect(f.text()).toContain(view.snapshot.flow.name);
	}
});

test("document commands explicitly read V1 for both formats", async () => {
	for (const document of [legacyDocumentV1Example, publishedDocumentV1Example]) {
		const f = fixture(() => document);
		expect(await run(["flow", "document", "show", "review", "--json"], f.deps)).toBe(0);
		expect(JSON.parse(f.text())).toEqual(document);
		expect(f.calls).toEqual([{ path: "/rpc/flowDocumentsV1/get", input: { flow: "review" } }]);
	}
});

test("unknown versions and formats fail without a legacy request", async () => {
	for (const change of [{ schemaVersion: 2 }, { engine: "future" }]) {
		for (const [args, value] of [
			[["flow", "document", "show", "review"], publishedDocumentV1Example],
			[["flow", "run", "show", legacyRun.id], executionViewV1Example],
		] as const) {
			const f = fixture(() => ({ ...value, ...change }));
			expect(await run([...args, "--json"], f.deps)).not.toBe(0);
			expect(f.calls).toHaveLength(1);
			expect(f.text()).toBe("");
		}
	}
});

test("document help exposes the format and makes no request", async () => {
	const f = fixture(() => {
		throw new Error("Unexpected request");
	});
	expect(await run(["flow", "document", "show", "--help"], f.deps)).toBe(0);
	expect(f.text()).toContain("version 1");
	expect(f.calls).toEqual([]);
});
