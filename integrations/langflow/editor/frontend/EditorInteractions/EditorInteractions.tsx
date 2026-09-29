import { useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { NativeInspector } from "../NativeInspector";
import { EditorOutline } from "../EditorOutline";
import { KeyboardConnections } from "../KeyboardConnections";

export function EditorInteractions() {
	const [inspected, setInspected] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [page, setPage] = useState<"outline" | "connections">("outline");
	return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setInspected(null); }}>
		<ShadTooltip content="Outline and keyboard connections"><DialogTrigger asChild>
			<Button type="button" variant="ghost" className="min-h-11 min-w-11 rounded-full" aria-label="Outline and keyboard connections"><IconComponent name="ListTree" /></Button>
		</DialogTrigger></ShadTooltip>
		<DialogContent className="max-h-screen overflow-auto">
			<DialogTitle>Flow interactions</DialogTitle>
			<DialogDescription>Find nested components and edit connections with the keyboard.</DialogDescription>
			{inspected === null && <div className="flex flex-wrap gap-2">
				<Button type="button" variant="secondary" aria-pressed={page === "outline"} onClick={() => setPage("outline")}>Outline</Button>
				<Button type="button" variant="secondary" aria-pressed={page === "connections"} onClick={() => setPage("connections")}>Connections</Button>
				<Button type="button" variant="secondary" onClick={() => useFlowsManagerStore.getState().undo()}>Undo</Button>
				<Button type="button" variant="secondary" onClick={() => useFlowsManagerStore.getState().redo()}>Redo</Button>
			</div>}
			{inspected !== null ? <NativeInspector key={inspected} nodeId={inspected} onClose={() => setInspected(null)} /> : page === "outline" ? <EditorOutline onReveal={() => setOpen(false)} onInspect={setInspected} /> : <KeyboardConnections />}
		</DialogContent>
	</Dialog>;
}
