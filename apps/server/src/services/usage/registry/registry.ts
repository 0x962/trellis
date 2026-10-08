import { result } from "../../agentRuns/terminal.ts";
import { core, prepared } from "../../registryEntry";
import { prepareAccounts } from "../accounts.ts";
import { mergedWork } from "../mergedWork";
import { prepareRanking } from "../ranking";
import { prepareReport } from "../usage.ts";

export const usageServices = {
	"usage.mergedWork": core("read", mergedWork),
	"usage.report": prepared("read", prepareReport, result),
	"usage.ranking": prepared("read", prepareRanking, result),
	"usage.accounts": prepared("read", prepareAccounts, result),
};
