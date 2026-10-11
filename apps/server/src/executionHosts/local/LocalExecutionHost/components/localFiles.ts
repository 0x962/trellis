import { assertTarget, readAllOutput } from "@trellis/runtime-protocol/execution";
import { agentWorkspace } from "../../../../agents/native/workspace.ts";
import { attemptCapturePath, attemptStopped, writeAttemptCapture } from "../../../../services/agentRuns.ts";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";
import { readLocalDescriptor } from "./readLocalDescriptor.ts";
import { redactDescriptor } from "./redactDescriptor.ts";

export const localFiles = (deps: LocalHostDeps): Pick<LocalExecutionHost, "files" | "transcript"> => {
	const client = () => deps.connection.client();
	return {
		files: {
			async descriptor(target) {
				assertTarget(deps.binding, target);
				return redactDescriptor(await readLocalDescriptor(deps.home, target.attemptId));
			},
			capturePath(target) {
				assertTarget(deps.binding, target);
				return attemptCapturePath(deps.home, target.runId, target.attemptId);
			},
			async captureExists(target) {
				assertTarget(deps.binding, target);
				return attemptStopped(deps.home, target.runId, target.attemptId);
			},
			async writeCapture(target, text) {
				assertTarget(deps.binding, target);
				return writeAttemptCapture(deps.home, target.runId, target.attemptId, text);
			},
			workspacePath(target) {
				assertTarget(deps.binding, target);
				return agentWorkspace(deps.home, target.runId);
			},
		},
		transcript: {
			async output(target, offset, stream) {
				assertTarget(deps.binding, target);
				return client().output(target.attemptId, offset, stream);
			},
			async readAll(target, stream) {
				assertTarget(deps.binding, target);
				return readAllOutput(await deps.connection.ensure(), target.attemptId, stream);
			},
			subscribe(target, offset, stream, signal) {
				assertTarget(deps.binding, target);
				return client().subscribe(target.attemptId, offset, signal, stream);
			},
		},
	};
};
