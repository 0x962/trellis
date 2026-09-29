import { useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { EditorOutline } from "../EditorOutline";
import { KeyboardConnections } from "../KeyboardConnections";

export function EditorInteractions() {
	const [open, setOpen] = useState(false);
	const [page, setPage] = useState<"outline" | "connections">("outline");
	return <Dialog open={open} onOpenChange={setOpen}>
		<ShadTooltip content="Outline and keyboard connections"><DialogTrigger asChild>
			<Button type="button" variant="ghost" className="min-h-11 min-w-11 rounded-full" aria-label="Outline and keyboard connections"><IconComponent name="ListTree" /></Button>
		</DialogTrigger></ShadTooltip>
		<DialogContent className="max-h-screen overflow-auto">
			<DialogTitle>Flow interactions</DialogTitle>
			<DialogDescription>Find nested components and edit connections with the keyboard.</DialogDescription>
			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="secondary" aria-pressed={page === "outline"} onClick={() => setPage("outline")}>Outline</Button>
				<Button type="button" variant="secondary" aria-pressed={page === "connections"} onClick={() => setPage("connections")}>Connections</Button>
				<Button type="button" variant="secondary" onClick={() => useFlowsManagerStore.getState().undo()}>Undo</Button>
				<Button type="button" variant="secondary" onClick={() => useFlowsManagerStore.getState().redo()}>Redo</Button>
			</div>
			{page === "outline" ? <EditorOutline onReveal={() => setOpen(false)} /> : <KeyboardConnections />}
		</DialogContent>
	</Dialog>;
}
