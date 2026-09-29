import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { APIClassType, InputFieldType } from "@/types/api";
import { DeclaredField } from "../DeclaredField";

export function NativeInspector({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
	const node = useFlowStore((state) => state.nodes.find((item) => item.id === nodeId));
	const graph = useFlowStore((state) => state.currentFlow?.data);
	const [initial] = useState(() => JSON.stringify(node!.data.node));
	const [draft, setDraft] = useState<APIClassType>(() => structuredClone(node!.data.node) as APIClassType);
	const [message, setMessage] = useState("");
	const prefix = useId();
	const bound = Boolean(graph && "trellisSource" in graph);
	const order = [...new Set([...(draft.field_order ?? []), ...Object.keys(draft.template)])];
	const fields = order.filter((name) => name !== "code" && typeof draft.template[name] === "object" && draft.template[name] !== null);
	return <form className="flex min-w-0 flex-col gap-4" aria-label="Component inspector" onSubmit={(event) => {
		event.preventDefault();
		const state = useFlowStore.getState();
		const current = state.nodes.find((item) => item.id === nodeId);
		if (!current || JSON.stringify(current.data.node) !== initial) {
			setMessage("This component changed. Cancel and reopen it before Save."); return;
		}
		useFlowsManagerStore.getState().takeSnapshot();
		state.setNodes(state.nodes.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, node: structuredClone(draft) } } : item));
		onClose();
	}}>
		<p>{node?.data.type} · {nodeId}</p>
		<div data-trellis-node={nodeId} data-trellis-field="display_name">
			<Label htmlFor={`${prefix}-name`}>Name</Label>
			<Input id={`${prefix}-name`} value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} />
		</div>
		<div data-trellis-node={nodeId} data-trellis-field="description">
			<Label htmlFor={`${prefix}-description`}>Description</Label>
			<Textarea id={`${prefix}-description`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
		</div>
		{bound && <p role="status">The original flow controls these inputs. Changes require an atomic update to its source and bindings.</p>}
		{fields.map((name) => <DeclaredField key={name} nodeId={nodeId} name={name} field={draft.template[name]}
			value={draft.template[name].value} sourceBound={bound} onChange={(value) => {
				setDraft((current) => ({ ...current, template: { ...current.template,
					[name]: { ...current.template[name], value } as InputFieldType,
				} }));
			}} />)}
		{message && <p role="alert">{message}</p>}
		<div className="flex flex-wrap gap-2">
			<Button type="submit" disabled={!node}>Save component</Button>
			<Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
		</div>
	</form>;
}
