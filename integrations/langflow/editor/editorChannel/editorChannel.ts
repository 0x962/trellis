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
		if (active() && ready) options.send({ ...envelope(), type: "select-issue", focus }, options.editorOrigin);
	};
	const restoreFocus = (focus: EditorFocus | null) => {
		if (active() && ready) options.send({ ...envelope(), type: "restore-focus", focus }, options.editorOrigin);
	};
	const revoke = () => {
		revoked = true;
		ready = false;
	};
	return { initialize, receive, selectIssue, restoreFocus, revoke, active };
}
