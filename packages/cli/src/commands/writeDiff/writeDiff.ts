import type { PullRequestDiffInput, PullRequestDiffOutput } from "@trellis/api";
import type { Writer } from "../../output.ts";

type ReadDiffPage = (input: PullRequestDiffInput) => Promise<PullRequestDiffOutput>;

export const writeDiff = async (out: Writer, json: boolean, read: ReadDiffPage, id: string): Promise<void> => {
	if (json) out.write('{"diff":"');
	let cursor: string | undefined;
	do {
		const page = await read(cursor === undefined ? { id } : { id, cursor });
		out.write(json ? JSON.stringify(page.diff).slice(1, -1) : page.diff);
		cursor = page.nextCursor ?? undefined;
	} while (cursor !== undefined);
	if (json) out.write('"}\n');
};
