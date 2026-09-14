import type { EvidenceCheck } from "@trellis/api";
import { nativeClient } from "../../agents/native/connection.ts";
import { finishCheck } from "./finishCheck.ts";
import type { EvidenceCtx } from "./types.ts";

export const reconcileCheck = async (ctx: EvidenceCtx, document: Omit<EvidenceCheck, "current">, workspace: string) => {
	if (document.state !== "running" && document.state !== "unknown") return document;
	try {
		const session = (await nativeClient(ctx.home).list()).find((item) => item.id === document.id);
		if (document.state === "unknown" && session?.status !== "exited") return document;
		return session?.status === "running" ? document : await finishCheck(ctx, document, workspace, session ?? null);
	} catch (cause) {
		if (document.state === "unknown") return document;
		return finishCheck(ctx, document, workspace, null, cause instanceof Error ? cause.message : String(cause));
	}
};
