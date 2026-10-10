import { Tooltip } from "@trellis/ui";
import { Handle, type HandleProps, useNodeId, useStore, useStoreApi, useViewport } from "@xyflow/react";
import type { CSSProperties } from "react";

export function FlowHandle({ label, branch, ...props }: HandleProps & { label: string; branch?: "Yes" | "No" }) {
	const store = useStoreApi();
	const nodeId = useNodeId();
	const { zoom } = useViewport();
	const active = useStore(
		(state) => state.connectionClickStartHandle?.nodeId === nodeId && state.connectionClickStartHandle.id === props.id,
	);
	const handle = (
		<Handle
			{...props}
			style={{ ...props.style, "--flow-zoom": zoom } as CSSProperties}
			data-branch={branch}
			role="button"
			tabIndex={0}
			aria-label={label}
			aria-pressed={active}
			aria-describedby="flow-connection-instructions"
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					const state = store.getState();
					const source = state.connectionClickStartHandle;
					if (source === null) {
						if (props.isConnectableStart !== false) {
							store.setState({ connectionClickStartHandle: { nodeId: nodeId!, type: props.type, id: props.id! } });
						}
					} else {
						const connection = {
							source: source.nodeId,
							sourceHandle: source.id!,
							target: nodeId!,
							targetHandle: props.id!,
						};
						if (state.isValidConnection!(connection)) state.onConnect!(connection);
						store.setState({ connectionClickStartHandle: null });
					}
				}
				if (event.key === "Escape") {
					event.preventDefault();
					store.setState({ connectionClickStartHandle: null });
				}
			}}
		/>
	);
	return <Tooltip content={label}>{handle}</Tooltip>;
}
