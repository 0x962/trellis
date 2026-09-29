import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lockHome } from "../../../homeLock";
import { protocolDigest } from "../../../langflowContracts";
import { closed, context } from "../components/context";
import { databaseInventory } from "../components/inventory";
import {
	InstalledDatabaseSchema,
	type OpenedDatabaseEvidence,
	OpenedDatabaseEvidenceSchema,
	type VerifiedRestoredDatabase,
} from "../components/schema";

export async function withRestoredDatabaseOpen<T extends { close(): Promise<void> }>(
	input: { home: string; dataDir: string; installReceiptId: string; bootId: string },
	operation: (verified: VerifiedRestoredDatabase) => Promise<{ value: T; receipt: OpenedDatabaseEvidence }>,
) {
	const ctx = context(input.home);
	const lock = lockHome(ctx.directory, "restore", null);
	try {
		const installed = InstalledDatabaseSchema.parse(JSON.parse(ctx.objects.read(input.installReceiptId)));
		if (
			ctx.objects.readBinding("installation") !== input.installReceiptId ||
			!isDeepStrictEqual(installed.identity, ctx.identity)
		) {
			throw new Error("restored_database_installation_conflict");
		}
		closed(ctx, installed.block);
		const dataDir = await realpath(input.dataDir);
		if (dataDir !== installed.dataDir || dataDir !== join(ctx.identity.home, "db"))
			throw new Error("restored_database_path_conflict");
		if (
			protocolDigest(JSON.stringify(installed.inventory)) !== installed.inventoryDigest ||
			!isDeepStrictEqual(await databaseInventory(dataDir), installed.inventory)
		) {
			throw new Error("restored_database_bytes_changed");
		}
		const key = JSON.stringify(["opened", input.bootId]);
		if (ctx.objects.findBinding(key)) throw new Error("restored_database_boot_already_opened");
		const { inventory: _inventory, ...scope } = installed;
		const verified: VerifiedRestoredDatabase = {
			...scope,
			installReceiptId: input.installReceiptId,
			bootId: input.bootId,
		};
		const result = await operation(structuredClone(verified));
		try {
			const evidence = OpenedDatabaseEvidenceSchema.parse(result.receipt);
			if (evidence.dataDir !== dataDir || evidence.bootId !== input.bootId)
				throw new Error("restored_database_open_scope_conflict");
			for (const source of [evidence.migrations, evidence.facts]) {
				if (protocolDigest(source.sourceBytes) !== source.sourceDigest)
					throw new Error("restored_database_open_digest_conflict");
			}
			closed(ctx, installed.block);
			const sourceBytes = JSON.stringify({ version: 1, verified, evidence });
			const receiptId = ctx.objects.write(sourceBytes);
			ctx.objects.bind(key, receiptId);
			return { value: result.value, receiptId, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
		} catch (error) {
			await result.value.close();
			throw error;
		}
	} finally {
		lock.release();
	}
}
