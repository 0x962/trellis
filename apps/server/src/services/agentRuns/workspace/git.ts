import { runGit } from "./gitProcess.ts";

export const git = (workspace: string, args: string[], signal?: AbortSignal) =>
	runGit(workspace, args, signal, async (stream) => {
		const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
		let text = "";
		for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
		return text + decoder.decode();
	});
