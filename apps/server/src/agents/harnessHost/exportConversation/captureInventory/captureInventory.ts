import { isDeepStrictEqual } from "node:util";
import type { RuntimeCaptureInventory } from "@trellis/runtime-protocol";
import type {
	ConversationIdentity,
	ConversationInventory,
	ConversationUnavailable,
} from "../../../harnesses/conversationExport/types";

export function captureInventory(
	capture: RuntimeCaptureInventory,
	identity: ConversationIdentity,
): ConversationInventory | ConversationUnavailable {
	if (identity.profileId === null || identity.providerSessionId.length === 0)
		return { state: "unavailable", reason: "conversation_launch_identity_missing" };
	if (!capture.binding.identities.some((saved) => isDeepStrictEqual(saved, identity)))
		throw new Error("conversation_capture_identity_conflict");
	const roots = capture.binding.roots.filter(
		(root) => root.kind === "conversation" && isDeepStrictEqual(root.identity, identity),
	);
	const history = capture.unavailable.filter((entry) => isDeepStrictEqual(entry.identity, identity));
	if (roots.length === 0) return { state: "unavailable", reason: "conversation_root_unavailable", history };
	if (roots.length !== 1) return { state: "unavailable", reason: "conversation_root_ambiguous" };
	const root = roots[0]!;
	if (root.kind !== "conversation" || root.originalIdentity !== identity.attemptId)
		throw new Error("conversation_capture_identity_conflict");
	const entries = capture.entries.filter((entry) => entry.rootId === root.rootId && entry.kind !== "directory");
	if (entries.some((entry) => entry.kind === "symlink"))
		return { state: "unavailable", reason: "conversation_file_unavailable" };
	return {
		state: "held",
		binding: capture.binding,
		rootId: root.rootId,
		sourceKind: root.sourceKind,
		files: entries.flatMap((entry) =>
			entry.kind === "file" ? [{
				path: entry.path,
				kind: "file" as const,
				bytes: entry.size,
				sha256: entry.sha256,
				mode: entry.mode,
			}] : [],
		),
		unavailable: history,
	};
}
