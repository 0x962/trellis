import type { ActorRef, FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import type { EditorContent, EditorIdentity } from "../../../../../../integrations/langflow/editor/protocol";
import type { EditorSession } from "../../../../../../integrations/langflow/editor/session";

export type EditorDocument = Extract<FlowDocumentV1, { engine: "langflow" }>;
export type EditorDocumentRead = { document: FlowDocumentV1; projectId: string | null };
export type EditorDocumentSave = {
	document: FlowDocumentSaveV1Input;
	projectId: string | null;
};

export type EditorSessionIssueInput = {
	flow: string;
	expectedVersion: number;
};

export type EditorSessionIssueResult = {
	session: EditorSession;
	credential: { token: string; expiresAt: Date };
};

export type EditorParentSave = {
	channel: string;
	actor: ActorRef;
	input: FlowDocumentSaveV1Input;
};

export type InstalledEditorManifest = {
	hash: string;
	publicManifest: Record<string, unknown>;
	assertContent: (content: EditorContent) => Promise<void>;
};

export type EditorSessionOptions = {
	hostId: string;
	hostToken: string;
	parentOrigin: string;
	editorOrigin: string;
	actor: () => Promise<ActorRef>;
	expiresAt: (now: Date) => Date;
	now: () => Date;
	installedManifest: () => Promise<InstalledEditorManifest>;
	documents: {
		get: (actor: ActorRef, input: { flow: string }) => Promise<EditorDocumentRead>;
		save: (actor: ActorRef, input: EditorDocumentSave) => Promise<FlowDocumentV1>;
		receipt: (
			actor: ActorRef,
			input: { flow: string; requestId: string },
		) => Promise<{ requestBytes: string; receipt: FlowDocumentV1 } | null>;
	};
};

export type SavedEditorRequest = {
	bytes: Uint8Array;
	identity: EditorIdentity;
	response: string;
};

export type EditorGrant = {
	session: EditorSession;
	actor: ActorRef;
	projectId: string | null;
	project: string | null;
	revision: number;
	documentHash: string;
	tokenHash: string;
	revoked: boolean;
	conflicted: boolean;
	busy: boolean;
	pending: { requestId: string; bytes: Uint8Array } | null;
	receipts: Map<string, SavedEditorRequest>;
};
