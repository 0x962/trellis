import { Handle, type HandleProps, useNodeId, useStore, useStoreApi } from "@xyflow/react";

export function FlowHandle({ label, ...props }: HandleProps & { label: string }) {
	const store = useStoreApi();
	const nodeId = useNodeId();
	const active = useStore(
		(state) => state.connectionClickStartHandle?.nodeId === nodeId && state.connectionClickStartHandle.id === props.id,
	);
	return (
		<Handle
			{...props}
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
}
