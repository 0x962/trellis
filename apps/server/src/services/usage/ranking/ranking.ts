import type { UsageRankingInput } from "@trellis/api";
import type { IoCtx } from "../../support.ts";
import { readRankingReport } from "../usage.ts";
import { rankingPage } from "./rankingPage.ts";

export const prepareRanking = async (ctx: IoCtx, input: UsageRankingInput) =>
	rankingPage(await readRankingReport(ctx, input), input);
