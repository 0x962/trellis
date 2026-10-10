import type { RuntimeClient } from "../../client.ts";
import type { RuntimeStream } from "../../index.ts";

// Reads the whole retained stream of one session. The first read at the
// largest offset gives the end of the stream. The reads from offset zero
// then page up to that end, so bytes the process writes during the read stay
// out of the answer.
export async function readAllOutput(
	client: Pick<RuntimeClient, "output">,
	id: string,
	stream: RuntimeStream = "stdout",
): Promise<string> {
	const end = (await client.output(id, Number.MAX_SAFE_INTEGER, stream)).nextOffset;
	const chunks: Buffer[] = [];
	let offset = 0;
	while (offset < end) {
		const output = await client.output(id, offset, stream);
		if (output.nextOffset === offset) break;
		chunks.push(Buffer.from(output.data, "base64").subarray(0, end - output.startOffset));
		offset = output.nextOffset;
	}
	return Buffer.concat(chunks).toString("utf8");
}
