import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

type Request<Input, Result> = {
	input: Input;
	phase: "pending" | "unknown" | "conflict" | "received";
	result?: Result;
	error?: string;
};

export function useFlowActionRequest<Input, Result>(key: string[], send: (input: Input) => Promise<Result>) {
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
		mutationFn: ({ input, execute }: { input: Input; key: string[]; execute: typeof send }) => execute(input),
		onSuccess: (result, { input, key }) => {
			queryClient.setQueryData(key, { input, phase: "received", result });
			void queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
		},
		onError: (error, { input, key }) => {
			const conflict = "code" in error && error.code === "FLOW_VERSION_CONFLICT";
			queryClient.setQueryData(key, { input, phase: conflict ? "conflict" : "unknown", error: error.message });
			void queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
		},
	});
	return {
		request: request.data,
		submit(input: Input) {
			if (queryClient.getQueryData(queryKey) !== null) return;
			save({ input, phase: "pending" });
			mutation.mutate({ input, key: queryKey, execute: send });
		},
		clearConflict() {
			if (queryClient.getQueryData<Request<Input, Result>>(queryKey)?.phase === "conflict") save(null);
		},
	};
}
