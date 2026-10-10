import { join } from "node:path";
import type { LaunchSpec, RuntimeSession } from "@trellis/runtime-protocol";
import { assertTarget, fingerprintDigest, runLaunch, startLaunch } from "@trellis/runtime-protocol/execution";
import { definedEnvironment } from "../../../../executionEnvironment/executionEnvironment.ts";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";
import { prepareHost } from "./prepareHost.ts";
import { readLocalDescriptor } from "./readLocalDescriptor.ts";

export const localLaunch = (deps: LocalHostDeps): Pick<LocalExecutionHost, "launch"> => {
	// The digest of the fingerprint of the prepared launch record, or null when
	// the attempt has no record or a record without a fingerprint, which is a
	// custom launch.
	const descriptorDigest = async (attemptId: string) => {
		if (!(await Bun.file(join(deps.home, "harness-attempts", attemptId, "launch.json")).exists())) return null;
		const { fingerprint } = await readLocalDescriptor(deps.home, attemptId);
		return fingerprint === undefined ? null : fingerprintDigest(fingerprint);
	};
	return {
		launch: {
			async start(target, spec) {
				assertTarget(deps.binding, target);
				const client = await deps.connection.ensure();
				// The login environment of the host goes under the attempt
				// environment of the spec. An attempt value replaces a host value of
				// the same name, and the type of the spec admits no other key.
				const full: LaunchSpec = { ...spec, env: { ...definedEnvironment(await deps.env()), ...spec.env } };
				return startLaunch(
					(launch) => client.start(launch),
					target,
					full,
					() => descriptorDigest(target.attemptId),
				);
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
				const digest = fingerprintDigest(descriptor.fingerprint);
				if (session !== undefined) return { kind: "receipt", target, session, descriptorDigest: digest };
				const spec = timeoutMs === undefined ? descriptor.spec : { ...descriptor.spec, timeoutMs };
				return startLaunch(
					(launch) => client.start(launch),
					target,
					spec,
					async () => digest,
				);
			},
			async confirmed(target, input, mode) {
				assertTarget(deps.binding, target);
				await deps.connection.ensure();
				const { host, launch } = await prepareHost(deps, target, input);
				// The launch runs through the HarnessHost, which prepares the record
				// again, starts the process and waits for the confirmation of the
				// harness. The spec it starts is the spec of that record.
				const confirm = async (): Promise<RuntimeSession> =>
					(mode.kind === "start"
						? await host.start(launch)
						: await host.resume({ ...launch, sessionId: mode.sessionId })
					).process;
				return runLaunch(target, confirm, () => descriptorDigest(target.attemptId));
			},
		},
	};
};
