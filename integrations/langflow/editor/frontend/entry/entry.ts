import type { APIObjectType } from "@/types/api";
import type { FlowType } from "@/types/flow";
import { editorPalette } from "../../editorPalette";
import { createFrameDriver } from "../../frameDriver";
import type { EditorContent } from "../../protocol";
import { openEditorReads } from "../../scopedReads";
import { TRELLIS_EDITOR_BRIDGE } from "../mode";
import { nativeDriver } from "../nativeDriver";

let reads: Awaited<ReturnType<typeof openEditorReads>>;
let initialContent: Promise<EditorContent>;

export async function startEditorBridge() {
	if (!TRELLIS_EDITOR_BRIDGE) return;
	const channel = new URL(location.href).searchParams.get("trellisChannel");
	const flowId = decodeURIComponent(location.pathname.split("/")[2] ?? "");
	if (!channel || !flowId || window.parent === window) throw new Error("The editor requires a Trellis workspace.");
	reads = await openEditorReads({
		channel,
		flowId,
		origin: location.origin,
		fetch: window.fetch.bind(window),
		now: Date.now,
	});
	let deliver!: (content: EditorContent) => void;
	initialContent = new Promise((resolve) => {
		deliver = resolve;
	});
	const driver = nativeDriver(flowId);
	const bridge = createFrameDriver({
		...reads.bootstrap,
		editorOrigin: location.origin,
		now: Date.now,
		send: (event, origin) => window.parent.postMessage(event, origin),
		driver: {
			...driver,
			initialize: async (content) => {
				deliver(content);
				await driver.initialize(content);
			},
		},
	});
	const receive = (event: MessageEvent) => {
		void bridge.receive(event, event.source === window.parent);
	};
	window.addEventListener("message", receive);
	window.addEventListener(
		"pagehide",
		() => {
			bridge.dispose();
			window.removeEventListener("message", receive);
		},
		{ once: true },
	);
	bridge.connect();
}

export async function loadEditorFlow(flowId: string): Promise<FlowType> {
	if (flowId !== reads.bootstrap.identity.flowId) throw new Error("The editor flow does not match its grant.");
	const [document, content] = await Promise.all([reads.document(), initialContent]);
	return {
		id: document.flow.id,
		name: document.flow.name,
		description: document.flow.description,
		data: content.graphDocument as NonNullable<FlowType["data"]>,
		flow_type: "workflow",
		locked: false,
		access_type: "PRIVATE",
	};
}

export async function loadEditorPalette(): Promise<APIObjectType> {
	return editorPalette(await reads.catalog()) as APIObjectType;
}
