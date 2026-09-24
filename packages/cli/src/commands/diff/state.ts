import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { json } from "../../output.ts";
import { currentHead, resolvePullRequest } from "../pullRequestRef.ts";
import { pullRequestReadiness } from "../ready/pullRequestReady.ts";
import { markPullRequestReady } from "../ready/ready.ts";

const diff = { type: "positional", required: true, description: "Diff ID, URL, or owner/repo#number" } as const;

const check = defineCommand({
	meta: { name: "check", description: "Read all review gaps without a local state change" },
	args: { diff },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const ref = await resolvePullRequest(client, context.args.diff, false);
		const result = await pullRequestReadiness(client, ref, { checkFlows: ctx.actor().kind === "agent" });
		const localState = result.pullRequest.localState;
		const ready = result.ready && result.storedGaps.length === 0 && localState === "ready";
		ctx.out.write(
			json({
				...result,
				ready,
				localState,
				storedGaps: [...result.storedGaps, ...(localState === "ready" ? [] : [{ kind: "not-asked", count: 1 }])],
			}),
		);
		return ready ? 0 : 1;
	},
});

const setState = defineCommand({
	meta: { name: "set-state", description: "Set the local request for review" },
	args: {
		diff,
		state: { type: "positional", required: true, description: "ready or not-ready" },
		"flow-does-not-apply": { type: "string", description: "Reason no available flow fits this diff" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const state = context.args.state;
		if (state !== "ready" && state !== "not-ready") throw usageError("state must be ready or not-ready");
		const reason = context.args["flow-does-not-apply"];
		if (reason !== undefined && (state !== "ready" || reason.trim() === ""))
			throw usageError("--flow-does-not-apply requires a reason and the ready state");
		const ref = await resolvePullRequest(client, context.args.diff, true);
		if (state === "not-ready") {
			ctx.out.write(json(await client.pullRequests.setLocalState({ id: ref.id, localState: "not-ready" })));
			return 0;
		}
		if (reason !== undefined) {
			const head = await currentHead(client, ref);
			await client.pullRequests.writeFlowWaiver({ id: ref.id, headSha: head.sha, reason: reason.trim() });
		}
		const result = await pullRequestReadiness(client, ref, { checkFlows: ctx.actor().kind === "agent" });
		await markPullRequestReady(client, ref, result);
		ctx.out.write(
			json({
				...result,
				pullRequest: {
					...result.pullRequest,
					...(result.ready ? { localState: "ready", isDraft: false } : {}),
				},
				ready: result.ready && result.storedGaps.length === 0,
				materialComplete: result.ready,
				requestRecorded: result.ready,
				githubDraftCleared: result.ready && result.pullRequest.isDraft,
			}),
		);
		return result.ready ? 0 : 1;
	},
});

export const stateCommands = { check, "set-state": setState };
