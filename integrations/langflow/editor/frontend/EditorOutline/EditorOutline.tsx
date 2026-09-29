import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useFlowStore from "@/stores/flowStore";
import { deleteEditorSelection } from "../graphActions";
import { revealEditorFocus } from "../revealEditorFocus";

export function EditorOutline({ onReveal, onInspect }: { onReveal: () => void; onInspect?: (nodeId: string) => void }) {
	const nodes = useFlowStore((state) => state.nodes);
	const edges = useFlowStore((state) => state.edges);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState("");
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const pathOf = (id: string) => {
		const labels: string[] = []; const seen = new Set<string>();
		let node = byId.get(id);
		while (node && !seen.has(node.id)) {
			seen.add(node.id); labels.unshift(node.data.node?.display_name || node.data.type || node.id);
			node = node.parentId ? byId.get(node.parentId) : undefined;
		}
		return labels.join(" / ");
	};
	const matches = nodes.filter((node) => `${pathOf(node.id)} ${node.id}`.toLowerCase().includes(query.toLowerCase()));
	const selection = byId.get(selected);
	return <section aria-label="Component outline" className="flex min-w-0 flex-col gap-4">
		<Label htmlFor="trellis-outline-search">Find a component</Label>
		<Input id="trellis-outline-search" value={query} onChange={(event) => setQuery(event.target.value)} />
		<p role="status">{matches.length} components. Paths include every ancestor.</p>
		<ul aria-label="Components" className="max-h-60 overflow-auto">
			{matches.map((node) => <li key={node.id}>
				<Button type="button" variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal break-words text-left" aria-pressed={selected === node.id} onClick={() => setSelected(node.id)}>
					{pathOf(node.id)} · {node.id}
				</Button>
			</li>)}
		</ul>
		{selection && <div className="flex flex-col gap-2">
			<p>{pathOf(selected)}. {edges.filter((edge) => edge.source === selected || edge.target === selected).length} direct connections.</p>
			<div className="flex flex-wrap gap-2">
				<Button type="button" onClick={() => { onReveal(); requestAnimationFrame(() => revealEditorFocus({ nodeId: selected, field: null })); }}>Reveal component</Button>
				{onInspect && <Button type="button" variant="secondary" onClick={() => onInspect(selected)}>Inspect component</Button>}
				<Button type="button" variant="destructive" onClick={() => { deleteEditorSelection([selected], []); setSelected(""); }}>Delete component and descendants</Button>
			</div>
			<p>Undo restores the complete graph, including descendants and connections.</p>
		</div>}
	</section>;
}
