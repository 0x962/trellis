import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { RuntimeCaptureProducer } from "@trellis/runtime-protocol";
import { exportConversation, type ConversationIdentity } from "../../../agents/harnessHost/exportConversation";
import { protocolDigest } from "../../../langflowContracts";
import type { SnapshotMetadata } from "../manifest";
import { exportWorkspaceArchive } from "../workspaceArchive";
import { writeCaptureRecord } from "../writeCaptureRecord";

export async function exportCapturedHistory(
	capture: RuntimeCaptureProducer,
	input: { directory: string; signal: AbortSignal },
) {
	input.signal.throwIfAborted();
	const unavailable: SnapshotMetadata["unavailable"] = [];
	const inventory = await capture.inventory(capture.binding, input.signal);
	input.signal.throwIfAborted();
	if (!isDeepStrictEqual(inventory.binding, capture.binding)) throw new Error("paired_runtime_inventory_conflict");
	await writeCaptureRecord(join(input.directory, "workspaces", "runtime-capture.json"), {
		version: 1, binding: inventory.binding, unavailable: inventory.unavailable,
	}, input.signal);
	for (const missing of inventory.unavailable)
		unavailable.push({
			reference: `conversation:${missing.identity.agentRunId}:${missing.identity.attemptId}:${protocolDigest(JSON.stringify(missing))}`,
			reason: `${missing.code}: ${missing.message}`,
		});
	const workspaces = [];
	const conversations = [];
	const workspaceDirectory = join(input.directory, "workspaces", "archives");
	const conversationDirectory = join(input.directory, "conversations", "archives");
	await mkdir(workspaceDirectory, { mode: 0o700 });
	await mkdir(conversationDirectory, { mode: 0o700 });
	for (const workspace of capture.binding.workspaces) {
		input.signal.throwIfAborted();
		const path = `workspaces/archives/${protocolDigest(workspace.workspaceId)}`;
		const result = await exportWorkspaceArchive({ capture }, {
			binding: capture.binding, workspaceId: workspace.workspaceId,
			destination: join(input.directory, path), signal: input.signal,
		});
		if (result.state !== "exported") throw new Error("paired_workspace_export_unavailable");
		workspaces.push({ workspaceId: workspace.workspaceId, attemptIds: workspace.attemptIds, path,
			manifestDigest: result.sourceDigest, sealDigest: protocolDigest(result.sealSourceBytes) });
	}
	for (const identity of capture.binding.identities) {
		input.signal.throwIfAborted();
		const reference = `conversation:${identity.agentRunId}:${identity.attemptId}`;
		if (identity.providerSessionId === null || !["claude", "codex", "pi", "muse", "opencode"].includes(identity.harness)) {
			unavailable.push({ reference, reason: "The retained provider identity has no supported conversation exporter." });
			continue;
		}
		const path = `conversations/archives/${protocolDigest(identity.attemptId)}`;
		const result = await exportConversation(capture, {
			binding: capture.binding, identity: identity as ConversationIdentity,
			directory: join(input.directory, path), signal: input.signal,
		});
		if (result.state === "unavailable") {
			unavailable.push({ reference, reason: result.reason });
			if ("history" in result && result.history)
				for (const missing of result.history)
					if (!inventory.unavailable.some((entry) => isDeepStrictEqual(entry, missing)))
						unavailable.push({ reference: `${reference}:${protocolDigest(JSON.stringify(missing))}`, reason: `${missing.code}: ${missing.message}` });
		} else {
			conversations.push({ identity, path, manifestDigest: result.manifestSha256, receipts: result.receipts });
			for (const missing of result.manifest.unavailable)
				if (!inventory.unavailable.some((entry) => isDeepStrictEqual(entry, missing)))
					unavailable.push({ reference: `${reference}:${protocolDigest(JSON.stringify(missing))}`, reason: `${missing.code}: ${missing.message}` });
		}
	}
	await writeCaptureRecord(join(input.directory, "workspaces", "archives.json"), {
		version: 1, binding: capture.binding, workspaces,
	}, input.signal);
	await writeCaptureRecord(join(input.directory, "conversations", "archives.json"), {
		version: 1, binding: capture.binding, conversations, unavailable,
	}, input.signal);
	input.signal.throwIfAborted();
	return unavailable;
}
