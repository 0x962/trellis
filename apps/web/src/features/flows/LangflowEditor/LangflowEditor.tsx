import { FailureState } from "@trellis/ui";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createEditorChannel } from "../../../../../../integrations/langflow/editor/editorChannel";
import { editorOrigin } from "../../../../../../integrations/langflow/editor/editorOrigin";
import type {
	EditorContent,
	EditorFocus,
	EditorIdentity,
} from "../../../../../../integrations/langflow/editor/protocol";

export type LangflowEditorHandle = {
	selectIssue: (focus: EditorFocus) => void;
	restoreFocus: () => void;
};

export type LangflowEditorSession = {
	channel: string;
	identity: EditorIdentity;
	content: EditorContent;
	editorOrigin: string;
	expiresAt: string;
};

export type LangflowEditorProps = {
	ref?: Ref<LangflowEditorHandle>;
	session: LangflowEditorSession;
	grantActive: boolean;
	draftChanged: (content: EditorContent) => void;
	selectionChanged: (focus: EditorFocus | null) => void;
};

export function LangflowEditor(props: LangflowEditorProps) {
	if (!props.grantActive) {
		return <FailureState title="Editor access ended" description="Your flow needs a new editor session." />;
	}
	const { channel, identity, editorOrigin: origin, expiresAt } = props.session;
	return <EditorFrame key={JSON.stringify([channel, identity, origin, expiresAt])} {...props} />;
}

function EditorFrame({ ref, session, draftChanged, selectionChanged }: LangflowEditorProps) {
	const [initial] = useState(() => structuredClone(session));
	if (!Number.isFinite(Date.parse(initial.expiresAt))) throw new Error("The editor grant needs an expiry time.");
	const frame = useRef<HTMLIFrameElement>(null);
	const channel = useRef<ReturnType<typeof createEditorChannel> | null>(null);
	const callbacks = useRef({ draftChanged, selectionChanged });
	const focus = useRef<EditorFocus | null>(null);
	const loaded = useRef(false);
	const [state, setState] = useState<"pending" | "ready" | "expired" | "reloaded">(
		Date.parse(initial.expiresAt) <= Date.now() ? "expired" : "pending",
	);
	const origin = editorOrigin(initial.editorOrigin, window.location.origin);
	useEffect(() => {
		callbacks.current = { draftChanged, selectionChanged };
	}, [draftChanged, selectionChanged]);
	useImperativeHandle(
		ref,
		() => ({
			selectIssue: (target) => channel.current?.selectIssue(target),
			restoreFocus: () => channel.current?.restoreFocus(focus.current),
		}),
		[],
	);
	useEffect(() => {
		const connection = createEditorChannel({
			...initial,
			parentOrigin: window.location.origin,
			now: Date.now,
			send: (command, origin) => frame.current?.contentWindow?.postMessage(command, origin),
			draftChanged: (content) => callbacks.current.draftChanged(content),
			selectionChanged: (target) => {
				focus.current = target;
				callbacks.current.selectionChanged(target);
			},
			ready: () => setState("ready"),
		});
		channel.current = connection;
		const receive = (event: MessageEvent<unknown>) => {
			connection.receive(event, frame.current !== null && event.source === frame.current.contentWindow);
		};
		window.addEventListener("message", receive);
		let timer: ReturnType<typeof setTimeout>;
		const expire = () => {
			const remaining = Date.parse(initial.expiresAt) - Date.now();
			if (remaining <= 0) {
				connection.revoke();
				setState("expired");
			} else timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
		};
		expire();
		if (loaded.current) connection.initialize();
		return () => {
			clearTimeout(timer);
			connection.revoke();
			window.removeEventListener("message", receive);
			channel.current = null;
		};
	}, [initial]);
	if (state === "expired" || state === "reloaded") {
		return (
			<FailureState
				title={state === "expired" ? "Editor access ended" : "The editor reloaded"}
				description="Open a new editor session from your current draft."
			/>
		);
	}
	return (
		<section aria-label="Flow editor" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
			{state === "pending" && (
				<p role="status" className="absolute inset-0 p-4 text-sm text-fg-muted">
					Wait for the editor connection.
				</p>
			)}
			<iframe
				ref={frame}
				title="Langflow graph editor"
				src={`${origin}/flow/${encodeURIComponent(initial.identity.flowId)}/`}
				sandbox="allow-scripts allow-same-origin"
				referrerPolicy="no-referrer"
				className={`min-h-0 w-full min-w-0 flex-1 border-0 ${state === "pending" ? "invisible" : ""}`}
				inert={state !== "ready"}
				onLoad={() => {
					if (loaded.current) {
						channel.current?.revoke();
						setState("reloaded");
						return;
					}
					loaded.current = true;
					channel.current?.initialize();
				}}
			/>
		</section>
	);
}
