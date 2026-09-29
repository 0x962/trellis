import type {
	ClassificationReceipt,
	classificationStore,
} from "../../../db/queries/langflowExecution/classification.ts";

export function testStore() {
	let receipt: ClassificationReceipt | null = null;
	const store: Pick<typeof classificationStore, "claim" | "finish"> = {
		claim: async (_tx, input) => {
			if (receipt) return { acquired: false, receipt: structuredClone(receipt) };
			receipt = {
				receiptId: crypto.randomUUID(),
				binding: input.binding,
				ownerToken: input.ownerToken,
				requestBytes: input.requestBytes,
				state: "claimed",
				relevance: null,
				error: null,
			};
			return { acquired: true, receipt: structuredClone(receipt) };
		},
		finish: async (_tx, input) => {
			if (receipt!.state === "claimed") {
				receipt = {
					...receipt!,
					state: input.result.state,
					relevance: input.result.state === "succeeded" ? input.result.relevance : null,
					error: input.result.state === "failed" ? input.result.error : null,
				};
			}
			return structuredClone(receipt!);
		},
	};
	return {
		store,
		interrupt: () => {
			receipt = { ...receipt!, state: "failed", error: "Jev gate: interrupted", relevance: null };
		},
	};
}
