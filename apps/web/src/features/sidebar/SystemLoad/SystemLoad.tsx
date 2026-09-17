import { useQuery } from "@tanstack/react-query";
import { SystemLoad as SystemLoadView } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export function SystemLoad() {
	const { orpc } = useApp();
	const load = useQuery({
		...orpc.system.load.queryOptions({}),
		refetchInterval: 5_000,
	});
	const data = load.isError ? null : load.data;

	return <SystemLoadView cpuPercent={data?.cpuPercent ?? null} memoryPercent={data?.memoryPercent ?? null} />;
}
