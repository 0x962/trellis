import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { type DeliveryAuthorityV1, DeliveryAuthorityV1Schema, protocolDigest } from "../../langflowContracts";
import type { DispatchEffects } from "../dispatchEffects";
import type { DispatchBlock, DispatchPermit, ReconciliationReceipt, TerminalReceipt } from "../dispatchGate";
import { type HostControlIdentity, LangflowHostControl } from "../hostControl";
import { ReceiptObjectStore } from "./objectStore/objectStore";
import {
	AuthorityArchiveSchema,
	NativeSnapshotSchema,
	ReconciliationArchiveSchema,
	type ReconciliationSources,
	StopSnapshotSchema,
	TerminalArchiveSchema,
	type ValidationSource,
} from "./schema";

type ArchiveControl = { identity: HostControlIdentity; gate: Pick<DispatchEffects, "read"> };

export class DispatchReceiptArchive {
	private constructor(
		private readonly control: ArchiveControl,
		private readonly objects: ReceiptObjectStore,
	) {}

	static open(control: ArchiveControl) {
		return new DispatchReceiptArchive(
			control,
			new ReceiptObjectStore(join(LangflowHostControl.directory(control.identity.home), "receipts")),
		);
	}

	writeAuthority(input: { authorityBytes: string; issuanceReceiptId: string }) {
		const record = AuthorityArchiveSchema.parse({
			kind: "authority",
			dataHomeId: this.control.identity.dataHomeId,
			...input,
		});
		this.authorityGrant(record);
		const id = this.objects.write(JSON.stringify(record));
		this.objects.bind(this.authorityKey(record), id);
		this.objects.bind(this.capabilityKey(this.authorityGrant(record).authority.capabilityId), id);
		return { id, ...this.authorityGrant(record) };
	}

	readAuthority(receiptId: string) {
		const record = AuthorityArchiveSchema.parse(JSON.parse(this.objects.read(receiptId)));
		if (this.objects.readBinding(this.authorityKey(record)) !== receiptId)
			throw new Error("receipt_authority_not_issued");
		return { id: receiptId, ...this.authorityGrant(record) };
	}

	readAuthorityBytes(authority: DeliveryAuthorityV1): string {
		const receipt = this.readAuthority(this.objects.readBinding(this.capabilityKey(authority.capabilityId)));
		if (!isDeepStrictEqual(receipt.authority, authority)) throw new Error("receipt_authority_binding_conflict");
		return receipt.authorityBytes;
	}

	private capabilityKey(capabilityId: string) {
		return JSON.stringify(["authority-capability", this.control.identity.dataHomeId, capabilityId]);
	}

	private authorityKey(record: ReturnType<typeof AuthorityArchiveSchema.parse>) {
		return JSON.stringify(["authority", record.dataHomeId, record.issuanceReceiptId]);
	}

	private authorityGrant(record: ReturnType<typeof AuthorityArchiveSchema.parse>) {
		const authority = DeliveryAuthorityV1Schema.parse(JSON.parse(record.authorityBytes));
		if (record.dataHomeId !== this.control.identity.dataHomeId || authority.hostId !== this.control.identity.hostId) {
			throw new Error("receipt_authority_home_mismatch");
		}
		return {
			authority,
			authorityBytes: record.authorityBytes,
			authorityDigest: protocolDigest(record.authorityBytes),
			issuanceReceiptId: record.issuanceReceiptId,
		};
	}

	writeTerminal(input: {
		permit: DispatchPermit;
		outcome: TerminalReceipt["outcome"];
		sourceBytes: string;
		sourceDigest: string;
	}): TerminalReceipt {
		const record = TerminalArchiveSchema.parse({
			kind: "terminal",
			permit: input.permit,
			outcome: input.outcome,
			source: { sourceBytes: input.sourceBytes, sourceDigest: input.sourceDigest },
		});
		this.assertPermit(record.permit);
		this.assertSource(record.source);
		const id = this.objects.write(JSON.stringify(record));
		return { id, permit: record.permit, outcome: record.outcome };
	}

	async readTerminal(permit: DispatchPermit, receiptId: string): Promise<TerminalReceipt> {
		const record = TerminalArchiveSchema.parse(JSON.parse(this.objects.read(receiptId)));
		this.assertPermit(permit);
		this.assertSource(record.source);
		if (!isDeepStrictEqual(record.permit, permit)) throw new Error("receipt_permit_mismatch");
		return { id: receiptId, permit: record.permit, outcome: record.outcome };
	}

	writeReconciliation(input: {
		block: DispatchBlock;
		packageDigest: string;
		sources: ReconciliationSources;
	}): ReconciliationReceipt {
		const record = ReconciliationArchiveSchema.parse({ kind: "reconciliation", ...input });
		this.assertBlock(record.block);
		this.assertReconciliationSources(record.block, record.sources);
		const id = this.objects.write(JSON.stringify(record));
		return this.reconciliationReceipt(id, record);
	}

	readReconciliation(block: DispatchBlock, receiptId: string): ReconciliationReceipt {
		const record = ReconciliationArchiveSchema.parse(JSON.parse(this.objects.read(receiptId)));
		this.assertBlock(block);
		if (!isDeepStrictEqual(record.block, block)) throw new Error("receipt_block_mismatch");
		this.assertReconciliationSources(block, record.sources);
		return this.reconciliationReceipt(receiptId, record);
	}

	readRecordBytes(receiptId: string) {
		return this.objects.read(receiptId);
	}

	private assertPermit(permit: DispatchPermit) {
		if (permit.dataHomeId !== this.control.identity.dataHomeId) throw new Error("receipt_home_mismatch");
		const entry = this.control.gate.read().permits.find((item) => item.permit.id === permit.id);
		if (!entry || !isDeepStrictEqual(entry.permit, permit)) throw new Error("receipt_permit_unknown");
	}

	private assertBlock(block: DispatchBlock) {
		if (block.dataHomeId !== this.control.identity.dataHomeId) throw new Error("receipt_home_mismatch");
		if (!isDeepStrictEqual(this.control.gate.read().block, block)) throw new Error("receipt_block_not_current");
	}

	private assertSource(source: ValidationSource) {
		if (protocolDigest(source.sourceBytes) !== source.sourceDigest) throw new Error("receipt_source_digest_mismatch");
	}

	private assertReconciliationSources(block: DispatchBlock, sources: ReconciliationSources) {
		for (const source of Object.values(sources)) if (source) this.assertSource(source);
		if (block.reason.kind === "capture" && !sources.snapshotSeal) throw new Error("receipt_snapshot_not_sealed");
		NativeSnapshotSchema.parse(JSON.parse(sources.nativeAttempts.sourceBytes));
		const stops = StopSnapshotSchema.parse(JSON.parse(sources.stopObligations.sourceBytes));
		if (stops.dataHomeId !== block.dataHomeId || stops.blockId !== block.id || stops.generation !== block.generation) {
			throw new Error("receipt_stop_scope_mismatch");
		}
		if (stops.records.some((record) => record.stops.some((stop) => stop.state !== "confirmed"))) {
			throw new Error("receipt_stops_unconfirmed");
		}
	}

	private reconciliationReceipt(
		id: string,
		record: ReturnType<typeof ReconciliationArchiveSchema.parse>,
	): ReconciliationReceipt {
		const source = record.sources;
		return {
			id,
			block: record.block,
			packageDigest: record.packageDigest,
			trellisDatabaseReceiptId: source.trellisDatabase.sourceDigest,
			engineDatabaseReceiptId: source.engineDatabase.sourceDigest,
			secretReceiptId: source.secret.sourceDigest,
			ownershipReceiptId: source.ownership.sourceDigest,
			nativeAttemptsReceiptId: source.nativeAttempts.sourceDigest,
			stopObligationsReceiptId: source.stopObligations.sourceDigest,
			snapshotSealReceiptId: source.snapshotSeal?.sourceDigest ?? null,
		};
	}
}
