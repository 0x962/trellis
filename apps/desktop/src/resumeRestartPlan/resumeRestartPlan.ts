import { readRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import type { HostConnection } from "../host/host.ts";

export const resumeRestartPlan = async (home: string, host: HostConnection) => {
	const plan = await readRestartPlan(home);
	if (!plan) return;
	const response = await fetch(`${host.origin}/api/native-work/restart/resume`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${host.token}`,
			"content-type": "application/json",
			"x-trellis-actor": "human:desktop",
		},
		body: JSON.stringify({ restartId: plan.id }),
	});
	if (!response.ok) throw new Error(await response.text());
};
