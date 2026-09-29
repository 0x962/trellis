import { result } from "../../agentRuns/terminal.ts";
import { prepared } from "../../registryEntry";
import { prepareAccounts } from "../accounts.ts";
import { prepareRanking } from "../ranking";
import { prepareReport } from "../usage.ts";

export const usageServices = {
	"usage.report": prepared("read", prepareReport, result),
	"usage.ranking": prepared("read", prepareRanking, result),
	"usage.accounts": prepared("read", prepareAccounts, result),
};
