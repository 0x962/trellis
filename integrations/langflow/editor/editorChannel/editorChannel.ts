import { z } from "zod";
import { editorOrigin } from "../editorOrigin";
import {
	type EditorCommand,
	type EditorContent,
	EditorContentSchema,
	EditorEventSchema,
	type EditorFocus,
	type EditorIdentity,
	EditorIdentitySchema,
	sameEditorIdentity,
} from "../protocol";

type Options = {
	identity: EditorIdentity;
	content: EditorContent;
	channel: string;
	editorOrigin: string;
	parentOrigin: string;
	expiresAt: string;
	now: () => number;
	send: (command: EditorCommand, origin: string) => void;
	draftChanged: (content: EditorContent) => void;
	selectionChanged: (focus: EditorFocus | null) => void;
	ready: () => void;
};

export function createEditorChannel(options: Options) {
	const identity = EditorIdentitySchema.parse(options.identity);
	const content = EditorContentSchema.parse(options.content);
	editorOrigin(options.editorOrigin, options.parentOrigin);
	z.uuid().parse(options.channel);
	if (content.componentManifestHash !== identity.componentManifestHash) {
		throw new Error("The editor catalog does not match the document.");
	}
	const expiresAt = Date.parse(options.expiresAt);
	if (!Number.isFinite(expiresAt)) throw new Error("The editor grant needs an expiry time.");
	let revoked = false;
	let ready = false;
	let connected = false;
	let receivedSequence = 0;
	let sentSequence = 0;
	let suspended: string | null = null;
	let pending: {
		requestId: string;
		resolve: (content: EditorContent) => void;
		reject: (error: Error) => void;
	} | null = null;
	const active = () => !revoked && options.now() < expiresAt;
	const envelope = () => ({
		protocol: "trellis-editor-v1" as const,
		channel: options.channel,
		identity,
		sequence: ++sentSequence,
	});
	const sendInitial = () => {
		if (!active()) return;
		options.send({ ...envelope(), type: "initialize", content: structuredClone(content) }, options.editorOrigin);
	};
	const initialize = () => {
		if (sentSequence === 0) sendInitial();
	};
	const receive = (event: { origin: string; data: unknown }, fromCurrentFrame: boolean) => {
		if (!active() || !fromCurrentFrame || event.origin !== options.editorOrigin) return false;
		const parsed = EditorEventSchema.safeParse(event.data);
		if (!parsed.success) return false;
		const message = parsed.data;
		if (
			message.channel !== options.channel ||
			!sameEditorIdentity(message.identity, identity) ||
			message.sequence <= receivedSequence
		)
			return false;
		if (message.type === "connected") {
			if (connected || ready) return false;
			connected = true;
			receivedSequence = message.sequence;
			sendInitial();
			return true;
		}
		if (sentSequence === 0) return false;
		if (message.type === "ready") {
			if (ready) return false;
			ready = true;
			receivedSequence = message.sequence;
			options.ready();
			return true;
		}
		if (!ready) return false;
		if (message.type === "editing-suspended" || message.type === "editing-suspend-refused") {
			if (!pending || pending.requestId !== message.requestId) return false;
			if (message.type === "editing-suspended") {
				if (message.content.componentManifestHash !== identity.componentManifestHash) return false;
				options.draftChanged(message.content);
				suspended = message.requestId;
				pending.resolve(message.content);
			} else {
				pending.reject(
					new Error(
						message.reason === "open-control"
							? "Save or cancel the open editor control before you continue."
							: "Correct the invalid editor field before you continue.",
					),
				);
			}
			pending = null;
			receivedSequence = message.sequence;
			return true;
		}
		if (message.type === "draft-changed") {
			if (message.content.componentManifestHash !== identity.componentManifestHash) return false;
			receivedSequence = message.sequence;
			options.draftChanged(message.content);
		} else {
			receivedSequence = message.sequence;
			options.selectionChanged(message.focus);
		}
		return true;
	};
	const selectIssue = (focus: EditorFocus) => {
		if (active() && ready && !pending && !suspended)
			options.send({ ...envelope(), type: "select-issue", focus }, options.editorOrigin);
	};
	const restoreFocus = (focus: EditorFocus | null) => {
		if (active() && ready && !pending && !suspended)
			options.send({ ...envelope(), type: "restore-focus", focus }, options.editorOrigin);
	};
	const suspendEditing = () => {
		if (!active() || !ready || pending || suspended) {
			return Promise.reject(new Error("The editor cannot suspend its current draft."));
		}
		const requestId = crypto.randomUUID();
		const result = new Promise<EditorContent>((resolve, reject) => {
			pending = { requestId, resolve, reject };
		});
		options.send({ ...envelope(), type: "suspend-editing", requestId }, options.editorOrigin);
		return result;
	};
	const resumeEditing = () => {
		if (!active() || !ready || pending || !suspended) return false;
		options.send({ ...envelope(), type: "resume-editing", requestId: suspended }, options.editorOrigin);
		suspended = null;
		return true;
	};
	const revoke = () => {
		revoked = true;
		ready = false;
		pending?.reject(new Error("Editor access ended before the draft acknowledgement."));
		pending = null;
	};
	return { initialize, receive, selectIssue, restoreFocus, revoke, active, suspendEditing, resumeEditing };
}
