import { createHash } from "node:crypto";
import type {
	ConversationCaptureBinding,
	ConversationCaptureReader,
	ConversationInventory,
	ConversationIdentity,
} from "../../../harnesses/conversationExport/types";
import type { BuiltInHarness } from "../../../harnesses/types";

export function conversationFixture(harness: BuiltInHarness = "codex") {
	const identity: ConversationIdentity = {
		harness,
		accountId: "account-original",
		profileId: "profile-original",
		agentRunId: "run-original",
		attemptId: "attempt-original",
		providerSessionId: "session-original",
	};
	const binding: ConversationCaptureBinding = {
		captureId: "capture-fixture",
		snapshotId: "snapshot-fixture",
		hostId: "host-fixture",
		dataHomeId: "home-fixture",
		generation: 9,
		blockId: "block-fixture",
		workspaceId: "/synthetic/work",
		identities: [identity],
		roots: [{
			rootId: "root-original-profile",
			kind: "conversation",
			originalIdentity: identity.attemptId,
			identity,
			sourceKind: harness === "opencode" ? "opencode-export" : "account-profile",
		}],
	};
	const cases = {
		codex: ["sessions/2026/09/29/rollout-session-original.jsonl", '{"type":"session_meta","payload":{"id":"session-original"}}\n'],
		claude: ["projects/-synthetic-work/session-original.jsonl", '{"type":"user","sessionId":"session-original","message":{"content":"Synthetic prompt"}}\n'],
		pi: ["sessions/--synthetic-work--/2026_session-original.jsonl", '{"type":"session","id":"session-original","cwd":"/synthetic/work"}\n'],
		muse: ["muse/sessions/2026/09/29/session-original/session.jsonl", '{"stream":{"id":"session-original"},"payload_type":"runtime.session.metadata","payload":{"record":{"workspace_root":"/synthetic/work"}}}\n'],
		opencode: ["session.json", '{"info":{"id":"session-original"},"messages":[]}\n'],
	} as const;
	const [path, content] = cases[harness];
	const bytes = new TextEncoder().encode(` ${content}`);
	const inventory: ConversationInventory = {
		state: "held",
		binding,
		rootId: "root-original-profile",
		sourceKind: harness === "opencode" ? "opencode-export" : "account-profile",
		files: [{ path, kind: "file", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), mode: 0o600 }],
		unavailable: [{ identity, sourceKind: "account-profile", code: "earlier_history_not_retained", message: "Earlier history is unavailable." }],
	};
	const calls: string[] = [];
	let active = true;
	const reader: ConversationCaptureReader = {
		binding,
		async inventory() {
			calls.push("inventory");
			if (!active) throw new Error("capture_released");
			return structuredClone({
				binding: inventory.binding,
				entries: inventory.files.map((file) => ({
					rootId: inventory.rootId,
					path: file.path,
					kind: "file" as const,
					size: file.bytes,
					sha256: file.sha256,
					mode: file.mode,
				})),
				unavailable: inventory.unavailable,
			});
		},
		async *read(input) {
			calls.push(`read:${input.path}`);
			if (!active) throw new Error("capture_released");
			yield bytes.slice(0, 7);
			if (!active) throw new Error("capture_released");
			yield bytes.slice(7);
		},
		async seal(input) {
			calls.push("seal");
			if (!active) throw new Error("capture_released");
			return new TextEncoder().encode(` ${JSON.stringify({ schemaVersion: 1, kind: "trellis-runtime-capture-seal", ...input })}\n`);
		},
	};
	return { binding, identity, bytes, inventory, reader, calls, release: () => { active = false; } };
}
