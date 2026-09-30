import type {
	RuntimeCaptureBinding,
	RuntimeCaptureIdentity,
	RuntimeCaptureProducer,
	RuntimeCaptureUnavailable,
} from "@trellis/runtime-protocol";
import type { BuiltInHarness } from "../types";

export type ConversationIdentity = RuntimeCaptureIdentity & {
	harness: BuiltInHarness;
	providerSessionId: string;
};

export type ConversationCaptureBinding = RuntimeCaptureBinding;

export type ConversationUnavailable = {
	state: "unavailable";
	reason: string;
	history?: RuntimeCaptureUnavailable[];
};

export type CapturedConversationFile = {
	path: string;
	kind: "file" | "symlink" | "unavailable";
	bytes: number;
	sha256: string;
	mode: number;
};

export type ConversationInventory = {
	state: "held";
	binding: ConversationCaptureBinding;
	rootId: string;
	sourceKind: "account-profile" | "opencode-export";
	files: CapturedConversationFile[];
	unavailable: RuntimeCaptureUnavailable[];
};

export type ConversationCaptureReader = RuntimeCaptureProducer;

export type ConversationSelection =
	| ConversationUnavailable
	| { state: "selected"; transcript: string; files: CapturedConversationFile[] };

export type ConversationAdapter = {
	select(identity: ConversationIdentity, inventory: ConversationInventory): ConversationSelection;
	identifies(value: unknown, sessionId: string): "match" | "other" | "none";
	encoding: "jsonl" | "json";
};
