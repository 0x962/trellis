import type { IoCtx } from "../../support.ts";
import { prepareSessionObserverGenerations } from "../prepareSessionObserverGenerations";

export const requestSessionObserverGeneration = (ctx: IoCtx, runId: string) =>
	prepareSessionObserverGenerations(ctx, { runId, force: true });
