import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LangflowHostControl } from "../../langflowHost";
import { ReceiptObjectStore } from "../../langflowHost/objectStore";
import { retainNativePolicy } from "./nativePolicy";

test("missing native policy reads no host identity or file", async () => {
	expect(await retainNativePolicy("/missing/host", undefined)).toBeNull();
});

test("trusted policy retention preserves the original bytes outside the data home", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-native-policy-")));
	try {
		const home = join(root, "home");
		await mkdir(home, { mode: 0o700 });
		const { identity } = LangflowHostControl.initialize({
			home,
			initialBlock: { requestId: crypto.randomUUID(), reason: { kind: "initialize" } },
		});
		const path = join(root, "policy.json");
		const bytes = Buffer.from('{ "schemaVersion": 1, "text": "é  原文" }\n');
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		await writeFile(path, bytes, { mode: 0o600 });
		const retained = await retainNativePolicy(home, { path, sha256 });
		expect(retained).toEqual({ bytes, sha256 });
		const directory = join(LangflowHostControl.directory(home), "native-policy-configurations");
		expect(directory.startsWith(`${home}/`)).toBe(false);
		const objects = new ReceiptObjectStore(directory);
		const id = objects.readBinding(JSON.stringify([path, sha256]));
		const record = JSON.parse(objects.read(id));
		expect(record).toEqual({ version: 1, identity, path, sha256, bytesBase64: bytes.toString("base64") });
		await writeFile(path, Buffer.from("changed"));
		await expect(retainNativePolicy(home, { path, sha256 })).rejects.toThrow(
			"native_policy_configuration_digest_conflict",
		);
		expect(objects.readBinding(JSON.stringify([path, sha256]))).toBe(id);
		expect(Buffer.from(JSON.parse(objects.read(id)).bytesBase64, "base64")).toEqual(bytes);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("an untrusted digest creates no retained policy record", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-native-policy-reject-"));
	try {
		const home = join(root, "home");
		await mkdir(home, { mode: 0o700 });
		LangflowHostControl.initialize({
			home,
			initialBlock: { requestId: crypto.randomUUID(), reason: { kind: "initialize" } },
		});
		const path = join(root, "policy.json");
		await writeFile(path, "{}", { mode: 0o600 });
		await expect(retainNativePolicy(home, { path, sha256: "a".repeat(64) })).rejects.toThrow(
			"native_policy_configuration_digest_conflict",
		);
		expect(existsSync(join(LangflowHostControl.directory(home), "native-policy-configurations"))).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
