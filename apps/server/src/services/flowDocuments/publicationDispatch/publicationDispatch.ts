import { isDeepStrictEqual } from "node:util";
import type { FlowPublicationV1 } from "@trellis/api";

export type PublicationBinding = {
	effectId: string;
	kind: "admission" | "publication" | "recovery" | "native-dispatch" | "engine-delivery" | "decision";
	executionId: string | null;
	attemptId: string | null;
	jobId: string | null;
	requestId: string;
	payloadDigest: string;
};
export type PublicationPermit = {
	id: string;
	dataHomeId: string;
	generation: number;
	binding: PublicationBinding;
};
export type PublicationActions = {
	write(): Promise<FlowPublicationV1>;
	read(): Promise<FlowPublicationV1 | null>;
};

export const publicationDispatch = (gate: {
	recoverPermit(binding: PublicationBinding): { permit: PublicationPermit; terminal: unknown } | null;
	acquire(binding: PublicationBinding): PublicationPermit;
	settle(permit: PublicationPermit, receiptId: string): Promise<void>;
}) => ({
	run: async (binding: PublicationBinding, actions: PublicationActions): Promise<FlowPublicationV1> => {
		if (binding.kind !== "publication") throw new Error("publication_binding_invalid");
		const prior = gate.recoverPermit(binding);
		if (prior !== null && !isDeepStrictEqual(prior.permit.binding, binding))
			throw new Error("publication_permit_conflict");
		const permit = prior?.permit ?? gate.acquire(binding);
		const receipt = prior === null ? await actions.write() : await actions.read();
		if (receipt === null) throw new Error("publication_outcome_unknown");
		await gate.settle(permit, receipt.publicationId);
		return receipt;
	},
});
