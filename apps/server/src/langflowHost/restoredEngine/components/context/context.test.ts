import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualificationFixture } from "../../../../../../../integrations/langflow/release/loadQualifiedPackage/components/qualificationFixture/qualificationFixture";
import { DispatchStore } from "../../../dispatchGate/store/store";
import { LangflowHostControl } from "../../../hostControl";
import { withInstallContext } from "./context";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-restored-engine-context-")));
	roots.push(root);
	const home = join(root, "target");
	const directory = join(root, "envelope");
	await mkdir(home, { mode: 0o700 });
	await mkdir(directory, { mode: 0o700 });
	const initialized = LangflowHostControl.initialize({ home, initialBlock: {
		requestId: crypto.randomUUID(), reason: { kind: "restore", directory, snapshotId: crypto.randomUUID(),
			sourceDataHomeId: crypto.randomUUID(), manifestDigest: "a".repeat(64) },
	} });
	if (!initialized.block) throw new Error("fixture_block_missing");
	const qualified = await qualificationFixture();
	roots.push(qualified.root);
	return { home, hostId: initialized.identity.hostId, dataHomeId: initialized.identity.dataHomeId,
		block: initialized.block, qualification: qualified.options };
}

test("a changed target identity cannot enter the offline copy scope", async () => {
	const f = await fixture();
	await expect(withInstallContext({ ...f, hostId: crypto.randomUUID() }, async () => "unexpected")).rejects.toThrow("target_identity_conflict");
	expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
});

test("a different block cannot enter the offline copy scope", async () => {
	const f = await fixture();
	await expect(withInstallContext({ ...f, block: { ...f.block, generation: f.block.generation + 1 } }, async () => "unexpected")).rejects.toThrow("block_changed");
});

test("the held scope excludes dispatch mutations until the exact operation returns", async () => {
	const f = await fixture();
	const store = new DispatchStore(join(LangflowHostControl.directory(f.home), "dispatch"), f.dataHomeId);
	await withInstallContext(f, async () => {
		expect(() => store.mutate(() => "unexpected")).toThrow();
		await Promise.resolve();
		expect(() => store.mutate(() => "unexpected")).toThrow();
	});
	expect(store.mutate((state) => state.block)).toEqual(f.block);
});

test("a retained process record refuses copy even while dispatch is closed", async () => {
	const f = await fixture();
	await mkdir(join(f.home, "langflow/supervisor"), { recursive: true, mode: 0o700 });
	await writeFile(join(f.home, "langflow/supervisor/process.json"), "{}", { mode: 0o600 });
	await expect(withInstallContext(f, async () => "unexpected")).rejects.toThrow("process_record_present");
});
