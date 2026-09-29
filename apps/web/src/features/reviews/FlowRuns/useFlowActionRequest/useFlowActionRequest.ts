import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

type Request<Input, Result> = {
	input: Input;
	phase: "pending" | "unknown" | "conflict" | "preflight-failed" | "received";
	result?: Result;
	error?: string;
};

export function useFlowActionRequest<Input, Result>(
	key: string[],
	send: (input: Input) => Promise<Result>,
	preflight?: (input: Input) => Promise<void>,
) {
	const { queryClient, orpc } = useApp();
	const queryKey = ["flow-action-request", ...key];
	const request = useQuery<Request<Input, Result> | null>({
		queryKey,
		queryFn: skipToken,
		initialData: null,
		enabled: false,
		gcTime: Infinity,
	});
	const save = (value: Request<Input, Result> | null) => queryClient.setQueryData(queryKey, value);
	const mutation = useMutation({
		retry: false,
		mutationFn: async (operation: {
			input: Input;
			key: string[];
			execute: typeof send;
			preflight?: typeof preflight;
			dispatched: boolean;
		}) => {
			await operation.preflight?.(structuredClone(operation.input));
			operation.dispatched = true;
			return operation.execute(structuredClone(operation.input));
		},
		onSuccess: (result, { input, key }) => {
			queryClient.setQueryData(key, { input, phase: "received", result });
			void queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.flowDocumentsV1.key() });
		},
		onError: (error, { input, key, dispatched }) => {
			const conflict = "code" in error && error.code === "FLOW_VERSION_CONFLICT";
			const phase = !dispatched ? "preflight-failed" : conflict ? "conflict" : "unknown";
			queryClient.setQueryData(key, { input, phase, error: error.message });
			void queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.flowDocumentsV1.key() });
		},
	});
	return {
		request: request.data,
		submit(input: Input) {
			if (queryClient.getQueryData(queryKey) !== null) return;
			const original = structuredClone(input);
			save({ input: original, phase: "pending" });
			mutation.mutate({ input: original, key: queryKey, execute: send, preflight, dispatched: false });
		},
		replay() {
			const original = queryClient.getQueryData<Request<Input, Result>>(queryKey);
			if (original?.phase !== "unknown") return;
			save({ input: original.input, phase: "pending" });
			mutation.mutate({ input: original.input, key: queryKey, execute: send, dispatched: true });
		},
		clearConflict() {
			const phase = queryClient.getQueryData<Request<Input, Result>>(queryKey)?.phase;
			if (phase === "conflict" || phase === "preflight-failed") save(null);
		},
	};
}
