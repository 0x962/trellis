import type { RuntimeClient } from "@trellis/runtime-protocol/client";

export const checkOutput = async (client: RuntimeClient, id: string, stream: "stdout" | "stderr") => {
	const end = (await client.output(id, Number.MAX_SAFE_INTEGER, stream)).nextOffset;
	let offset = Math.max(0, end - 262144);
	let truncated = offset > 0;
	const chunks: Buffer[] = [];
	while (offset < end) {
		const output = await client.output(id, offset, stream);
		chunks.push(Buffer.from(output.data, "base64").subarray(0, end - output.startOffset));
		truncated ||= output.truncated;
		offset = output.nextOffset;
	}
	return { bytes: Buffer.concat(chunks), truncated };
};
