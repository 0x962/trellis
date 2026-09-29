import { isDeepStrictEqual } from "node:util";
import type { FlowPublicationV1 } from "@trellis/api";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchEffects, DispatchPermit, DispatchReceiptArchive, EffectBinding } from "../../../langflowHost";
import { TerminalArchiveSchema } from "../../../langflowHost/receiptArchive/schema";
import { documentBytes } from "../documentBytes";
import { type PublicationProof, readPublicationProof } from "../publicationProof";

export type PublicationBinding = EffectBinding;
export type PublicationPermit = DispatchPermit;
export type PublicationActions = {
	write(): Promise<PublicationProof>;
	read(): Promise<PublicationProof | null>;
};

export const publicationDispatch = (
	gate: Pick<DispatchEffects, "recoverPermit" | "acquire" | "settle">,
	archive: Pick<DispatchReceiptArchive, "writeTerminal" | "readTerminal" | "readRecordBytes">,
) => {
	const complete = async (permit: PublicationPermit, proof: PublicationProof) => {
		const validated = readPublicationProof(permit.binding, proof);
		const sourceBytes = documentBytes(validated.proof).toString("utf8");
		const terminal = archive.writeTerminal({
			permit,
			outcome: "completed",
			sourceBytes,
			sourceDigest: protocolDigest(sourceBytes),
		});
		await gate.settle(permit, terminal.id);
		return validated.receipt;
	};
	const resume = async (
		prior: NonNullable<ReturnType<DispatchEffects["recoverPermit"]>>,
		binding: PublicationBinding,
		actions: PublicationActions,
	): Promise<FlowPublicationV1 | null> => {
		if (!isDeepStrictEqual(prior.permit.binding, binding)) throw new Error("publication_permit_conflict");
		if (prior.terminal !== null) {
			const terminal = await archive.readTerminal(prior.permit, prior.terminal.id);
			if (terminal.outcome !== "completed") throw new Error("publication_terminal_conflict");
			const record = TerminalArchiveSchema.parse(JSON.parse(archive.readRecordBytes(terminal.id)));
			return readPublicationProof(binding, JSON.parse(record.source.sourceBytes)).receipt;
		}
		const proof = await actions.read();
		return proof === null ? null : complete(prior.permit, proof);
	};
	return {
		run: async (binding: PublicationBinding, actions: PublicationActions): Promise<FlowPublicationV1> => {
			if (binding.kind !== "publication") throw new Error("publication_binding_invalid");
			const prior = gate.recoverPermit(binding);
			if (prior === null) return complete(gate.acquire(binding), await actions.write());
			const receipt = await resume(prior, binding, actions);
			if (receipt === null) throw new Error("publication_outcome_unknown");
			return receipt;
		},
		recover: async (binding: PublicationBinding, actions: PublicationActions): Promise<FlowPublicationV1 | null> => {
			if (binding.kind !== "publication") throw new Error("publication_binding_invalid");
			const prior = gate.recoverPermit(binding);
			return prior === null ? null : resume(prior, binding, actions);
		},
	};
};
