import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { SnapshotMetadata } from "../manifest/manifest";
import { syncDirectory } from "../syncDirectory";
import { download } from "./components/download";
import { EngineSnapshotReceiptSchema } from "./components/receipt";

export async function exportEngineSnapshot(input: {
	endpoint: string;
	authenticationFile: string;
	directory: string;
	metadata: SnapshotMetadata;
	signal: AbortSignal;
}) {
	const endpoint = new URL(input.endpoint);
	if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.username || endpoint.password) {
		throw new Error("engine_snapshot_private_endpoint_required");
	}
	const token = await readFile(input.authenticationFile, "utf8");
	const binding = {
		snapshotId: input.metadata.snapshotId,
		sourceDataHomeId: input.metadata.sourceDataHomeId,
		sourceHostId: input.metadata.sourceHostId,
		boundaryReceiptId: input.metadata.boundary.receiptId,
		compatibility: input.metadata.compatibility,
	};
	const base = new URL("/api/v1/trellis/snapshots", endpoint);
	const response = await fetch(base, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify(binding),
		redirect: "error",
		signal: input.signal,
	});
	if (!response.ok) throw new Error("engine_snapshot_export_failed");
	const receipt = EngineSnapshotReceiptSchema.parse(await response.json());
	if (
		!isDeepStrictEqual(receipt.binding, binding) ||
		receipt.secret.sha256 !== binding.compatibility.secretVersion ||
		receipt.revisions.join(",") !== binding.compatibility.engineDatabaseVersion
	) {
		throw new Error("engine_snapshot_receipt_conflict");
	}
	const parts = [
		{ part: "database", path: join(input.directory, "engine", "database.sqlite"), expected: receipt.database },
		{ part: "secret", path: join(input.directory, "secrets", "engine-secret"), expected: receipt.secret },
	];
	for (const part of parts) {
		await download({
			url: new URL(`${base.pathname}/${binding.snapshotId}/${part.part}`, endpoint),
			token,
			path: part.path,
			expected: part.expected,
			signal: input.signal,
		});
	}
	const file = await open(join(input.directory, "engine", "receipt.json"), "wx", 0o600);
	try {
		await file.writeFile(JSON.stringify(receipt));
		await file.sync();
	} finally {
		await file.close();
	}
	await syncDirectory(join(input.directory, "engine"));
	await syncDirectory(join(input.directory, "secrets"));
	return receipt;
}
