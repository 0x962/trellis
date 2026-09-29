import { useQueries, useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";
import { discoveryDocument } from "../discoveryDocument";
import type { FlowDiscoveryInput } from "../flowDiscovery";

export function useFlowDiscovery() {
	const { orpc } = useApp();
	const flows = useQuery(orpc.flows.list.queryOptions({ input: {}, retry: false }));
	const documents = useQueries({
		queries: (flows.data ?? []).map((flow) =>
			orpc.flowDocumentsV1.get.queryOptions({ input: { flow: flow.id }, retry: false }),
		),
	});
	const failure = flows.error ?? documents.find((query) => query.error)?.error;
	const load: FlowDiscoveryInput["load"] = failure
		? { state: "failed", message: failure.message }
		: flows.isPending || documents.some((query) => query.isPending)
			? { state: "loading" }
			: { state: "loaded", entries: documents.flatMap((query) => (query.data ? [discoveryDocument(query.data)] : [])) };
	return {
		load,
		refreshing: flows.isFetching || documents.some((query) => query.isFetching),
		refresh: () => Promise.all([flows.refetch(), ...documents.map((query) => query.refetch())]),
	};
}
