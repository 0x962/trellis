import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolDigest } from "../../langflowContracts";
import { ReceiptObjectStore } from "./objectStore";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		chmodSync(root, 0o700);
		rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "trellis-object-store-test-"));
	roots.push(root);
	return { root, store: new ReceiptObjectStore(root) };
}

test("only an absent binding returns null", () => {
	const { root, store } = fixture();
	expect(store.findBinding("grant")).toBeNull();
	const id = store.write("saved grant");
	store.bind("grant", id);
	expect(store.findBinding("grant")).toBe(id);
	unlinkSync(join(root, `${id}.json`));
	expect(() => store.findBinding("grant")).toThrow();
});

test("binding lookup preserves permission errors", () => {
	const { root, store } = fixture();
	chmodSync(root, 0);
	expect(() => store.findBinding("grant")).toThrow();
});

test("binding lookup rejects a symlink instead of reporting an absent grant", () => {
	const { root, store } = fixture();
	symlinkSync(join(root, "missing"), join(root, `binding-${protocolDigest("grant")}.json`));
	expect(() => store.findBinding("grant")).toThrow();
});
