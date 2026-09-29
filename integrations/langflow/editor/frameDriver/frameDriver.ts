import { editorOrigin } from "../editorOrigin";
import {
	EditorCommandSchema,
	type EditorContent,
	type EditorEvent,
	type EditorFocus,
	type EditorIdentity,
	sameEditorIdentity,
} from "../protocol";

type Driver = {
	initialize: (content: EditorContent) => Promise<void>;
	subscribe: (callbacks: {
		draftChanged: (content: EditorContent) => void;
		selectionChanged: (focus: EditorFocus | null) => void;
	}) => () => void;
	selectIssue: (focus: EditorFocus) => void;
	restoreFocus: (focus: EditorFocus | null) => void;
};
type Options = {
	parentOrigin: string;
	editorOrigin: string;
	identity: EditorIdentity;
	channel: string;
	expiresAt: string;
	now: () => number;
	send: (event: EditorEvent, origin: string) => void;
	driver: Driver;
};

export function createFrameDriver(options: Options) {
	editorOrigin(options.editorOrigin, options.parentOrigin);
	const expiresAt = Date.parse(options.expiresAt);
	if (!Number.isFinite(expiresAt)) throw new Error("The editor grant needs an expiry time.");
	let disposed = false;
	let initialized = false;
	let ready = false;
	let received = 0;
	let sent = 0;
	let unsubscribe: (() => void) | null = null;
	const active = () => !disposed && options.now() < expiresAt;
	const envelope = () => ({
		protocol: "trellis-editor-v1" as const,
		channel: options.channel,
		identity: options.identity,
		sequence: ++sent,
	});
	const receive = async (event: { origin: string; data: unknown }, fromParent: boolean) => {
		if (!active() || !fromParent || event.origin !== options.parentOrigin) return false;
		const parsed = EditorCommandSchema.safeParse(event.data);
		if (!parsed.success) return false;
		const command = parsed.data;
		if (
			command.channel !== options.channel ||
			!sameEditorIdentity(command.identity, options.identity) ||
			command.sequence <= received
		)
			return false;
		if (command.type === "initialize") {
			if (initialized || command.content.componentManifestHash !== options.identity.componentManifestHash) return false;
			initialized = true;
			received = command.sequence;
			await options.driver.initialize(structuredClone(command.content));
			if (!active()) return false;
			unsubscribe = options.driver.subscribe({
				draftChanged: (content) => {
					if (!active() || !ready) return;
					options.send({ ...envelope(), type: "draft-changed", content }, options.parentOrigin);
				},
				selectionChanged: (focus) => {
					if (!active() || !ready) return;
					options.send({ ...envelope(), type: "selection-changed", focus }, options.parentOrigin);
				},
			});
			ready = true;
			options.send({ ...envelope(), type: "ready" }, options.parentOrigin);
			return true;
		}
		if (!ready) return false;
		received = command.sequence;
		if (command.type === "select-issue") options.driver.selectIssue(command.focus);
		else options.driver.restoreFocus(command.focus);
		return true;
	};
	const dispose = () => {
		disposed = true;
		ready = false;
		unsubscribe?.();
		unsubscribe = null;
	};
	return { receive, dispose };
}
