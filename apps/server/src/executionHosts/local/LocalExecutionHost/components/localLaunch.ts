import { join } from "node:path";
import { assertTarget, startLaunch } from "@trellis/runtime-protocol/execution";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";
import { readLocalDescriptor } from "./readLocalDescriptor.ts";

export const localLaunch = (deps: LocalHostDeps): Pick<LocalExecutionHost, "launch"> => {
	// The fingerprint of the prepared launch record, or null when the attempt
	// has no record or a record without one, which is a custom launch.
	const descriptorFingerprint = async (attemptId: string) => {
		if (!(await Bun.file(join(deps.home, "harness-attempts", attemptId, "launch.json")).exists())) return null;
		return (await readLocalDescriptor(deps.home, attemptId)).fingerprint ?? null;
	};
	return {
		launch: {
			async start(target, spec) {
				assertTarget(deps.binding, target);
				const client = await deps.connection.ensure();
				return startLaunch(client, target, spec, () => descriptorFingerprint(target.attemptId));
			},
			async startPrepared(target, timeoutMs) {
				assertTarget(deps.binding, target);
				const client = await deps.connection.ensure();
				const descriptor = await readLocalDescriptor(deps.home, target.attemptId);
				const answer = await client.list({ ids: [target.attemptId] });
				// A short answer says nothing about this attempt. A start on an
				// attempt that already runs would launch the command a second time.
				if (!answer.complete)
					throw new Error(`The execution service did not answer whether attempt ${target.attemptId} exists`);
				const [session] = answer.sessions;
				if (session !== undefined)
					return { kind: "receipt", target, session, descriptorFingerprint: descriptor.fingerprint };
				const spec = timeoutMs === undefined ? descriptor.spec : { ...descriptor.spec, timeoutMs };
				return startLaunch(client, target, spec, async () => descriptor.fingerprint);
			},
		},
	};
};
