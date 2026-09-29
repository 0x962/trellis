import { createHash } from "node:crypto";
import { runGit } from "./gitProcess.ts";

export const gitRecordPage = (
	workspace: string,
	args: string[],
	page: { offset: number; limit: number },
	signal?: AbortSignal,
) =>
	runGit(workspace, args, signal, async (stream) => {
		const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
		const hash = createHash("sha256");
		const items: string[] = [];
		let pending = "";
		let total = 0;
		const read = (text: string) => {
			pending += text;
			let end = pending.indexOf("\0");
			while (end !== -1) {
				if (total >= page.offset && items.length < page.limit) items.push(pending.slice(0, end));
				total += 1;
				pending = pending.slice(end + 1);
				end = pending.indexOf("\0");
			}
		};
		for await (const chunk of stream) {
			hash.update(chunk);
			read(decoder.decode(chunk, { stream: true }));
		}
		read(decoder.decode());
		if (pending !== "") {
			if (total >= page.offset && items.length < page.limit) items.push(pending);
			total += 1;
		}
		return { items, total, digest: hash.digest("hex") };
	});
