import type { RuntimeDelivery } from "@trellis/runtime-protocol";
import type { SessionRecord } from "../sessionRecord.ts";

type WriteInput = (data: string) => Promise<unknown>;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const flushQueuedInputs = async (record: SessionRecord, write: WriteInput) => {
	if (record.process === undefined || record.activity?.state === "working") return;
	for (const message of record.ledger.queuedInputs()) {
		try {
			await record.ledger.flushQueuedInput(message.messageId, write);
		} catch (error) {
			console.error(
				JSON.stringify({
					event: "queued input failed",
					sessionId: record.session.id,
					messageId: message.messageId,
					error: errorText(error),
				}),
			);
		}
	}
};

export const queueInput = async (
	record: SessionRecord,
	messageId: string,
	data: string,
	write: WriteInput,
): Promise<RuntimeDelivery> => {
	const delivery = record.ledger.queueInput(messageId, data);
	await flushQueuedInputs(record, write);
	return delivery.status === "written" || record.ledger.delivered(messageId)
		? { messageId, status: "written" }
		: delivery;
};
