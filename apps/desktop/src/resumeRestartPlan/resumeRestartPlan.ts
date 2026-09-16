import { readRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import type { HostConnection } from "../host/host.ts";

// The host resumes the agents in the background. `wait` holds this call until
// every agent of the plan has an outcome; a package update waits, a boot does not.
export const resumeRestartPlan = async (home: string, host: HostConnection, wait = false) => {
	const plan = await readRestartPlan(home);
	if (!plan) return;
	const response = await fetch(`${host.origin}/api/native-work/restart/resume`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${host.token}`,
			"content-type": "application/json",
			"x-trellis-actor": "human:desktop",
		},
		body: JSON.stringify({ restartId: plan.id, wait }),
	});
	if (!response.ok) throw new Error(await response.text());
};
