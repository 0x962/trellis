import type { FlowEngineV1 } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { readV1 } from "../readV1/readV1.ts";
import type { FlowRun } from "../runProgress/runProgress.ts";

export const readRun = async (client: TrellisClient, id: string, engine?: FlowEngineV1): Promise<FlowRun> => {
	if (engine === "legacy") return client.flowExecutions.get({ id });
	const view = readV1.execution(await client.flowDocumentsV1.view({ id }));
	return view.engine === "legacy" ? client.flowExecutions.get({ id }) : view;
};
