import { ensureNativeRuntime } from "../../../agents/native/connection.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import type { ServiceCtx } from "../../support.ts";

export async function recoverPreviousAttempt(ctx: Pick<ServiceCtx, "home">, id: string) {
	const runtime = await ensureNativeRuntime(ctx.home);
	return nativeHost(ctx.home, process.env, runtime).recover(id);
}
