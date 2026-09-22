import { Skeleton } from "@trellis/ui";
import { useEffect, useState } from "react";
import type { EditorViewProps } from "./components/EditorView";

type EditorModule = typeof import("./components/EditorView");

export type {
	CommentsHandle,
	CommentsState,
	EditorHandle,
	EditorViewProps,
	MovedAnchor,
	ThreadInput,
} from "./components/EditorView";

export type EditorChunkState = "idle" | "loading" | "ready";

let promise: Promise<EditorModule> | null = null;
let loaded: EditorModule | null = null;
let loads = 0;
// The descriptions on screen. The chunk is let go after the last one
// leaves, on idle, so a quick return to a ticket keeps the editor.
let holders = 0;
let pendingRelease = 0;

const forget = () => {
	loaded?.destroyEditor();
	loaded = null;
	promise = null;
	loads = 0;
};

const releaseWhenIdle = () => {
	pendingRelease += 1;
	const token = pendingRelease;
	const run = () => {
		if (token === pendingRelease && holders === 0) forget();
	};
	if (window.requestIdleCallback === undefined) run();
	else window.requestIdleCallback(run);
};

// The Tiptap chunk: the editor, its extensions, and ProseMirror. A
// description on screen requests it once, on idle or on the first edit. It
// never sits in the initial bundle. `instances` counts the editors alive;
// one serves every ticket.
export const editorChunk = {
	load: () => {
		if (promise === null) {
			loads += 1;
			const request: Promise<EditorModule> = import("./components/EditorView").then((module) => {
				if (promise === request) loaded = module;
				return module;
			});
			promise = request;
		}
		return promise;
	},
	ready: async () => {
		await editorChunk.load();
	},
	loads: () => loads,
	state: (): EditorChunkState => (loaded !== null ? "ready" : promise === null ? "idle" : "loading"),
	instances: () => (loaded === null ? 0 : loaded.instances()),
	retain: () => {
		holders += 1;
		pendingRelease += 1;
	},
	release: () => {
		holders -= 1;
		if (holders === 0) releaseWhenIdle();
	},
};

// Mounts the editor once its chunk is here. Until then a skeleton the
// height of a short description holds the place.
export function LazyEditor(props: EditorViewProps) {
	const [module, setModule] = useState<EditorModule | null>(loaded);
	useEffect(() => {
		let active = true;
		void editorChunk.load().then((next) => {
			if (active) setModule(next);
		});
		return () => {
			active = false;
		};
	}, []);
	if (module === null) return <Skeleton lines={3} width="w-2/3" className="min-h-24" />;
	return <module.EditorView {...props} />;
}
