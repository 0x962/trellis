import { z } from "zod";
import type { managerTools } from "../../../managerTools/managerTools.ts";
import { toolError } from "../../../managerTools/toolError/toolError.ts";

export function managerAdapter(tools: ReturnType<typeof managerTools>, threadId: () => string | undefined) {
	return {
		tools: tools.list().map((tool) => ({ type: "function" as const, ...tool })),
		async request(message: { method: string; params?: unknown }) {
			if (message.method !== "item/tool/call") return undefined;
			try {
				const call = z.object({ threadId: z.string(), tool: z.string(), arguments: z.unknown() }).parse(message.params);
				if (call.threadId !== threadId()) throw new Error("The tool call belongs to a different manager session.");
				const result = await tools.call(call.tool, call.arguments);
				return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(result) }] };
			} catch (error) {
				return { success: false, contentItems: [{ type: "inputText", text: toolError(error) }] };
			}
		},
	};
}
