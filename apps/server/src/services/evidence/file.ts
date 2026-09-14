import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { invalidInput } from "../../errors.ts";
import { hashFile } from "./hashFile.ts";
import { safeFile } from "./safeFile.ts";
import { target } from "./target.ts";
import type { EvidenceCtx } from "./types.ts";

export const file = async (ctx: EvidenceCtx, input: { runId: string; path: string }) => {
	const { workspace } = await ctx.newTx((tx) => target(ctx.core, tx, input));
	const path = await safeFile(workspace, input.path);
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const info = await handle.stat();
		if (!info.isFile()) throw invalidInput("path", "Select a file in the agent workspace.");
		const buffer = Buffer.alloc(Math.min(info.size, 262144));
		const { bytesRead } = await handle.read(buffer);
		const data = buffer.subarray(0, bytesRead);
		const binary = data.includes(0);
		return {
			path: input.path,
			text: binary ? null : data.toString("utf8"),
			sha256: await hashFile(handle),
			bytes: info.size,
			truncated: info.size > bytesRead,
			binary,
		};
	} finally {
		await handle.close();
	}
};
