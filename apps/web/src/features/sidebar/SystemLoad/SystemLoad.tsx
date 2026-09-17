import { useQuery } from "@tanstack/react-query";
import { SystemLoad as SystemLoadView } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export function SystemLoad() {
	const { orpc } = useApp();
	const load = useQuery({
		...orpc.system.load.queryOptions({}),
		refetchInterval: 5_000,
	});

	return <SystemLoadView cpuPercent={load.data?.cpuPercent ?? null} memoryPercent={load.data?.memoryPercent ?? null} />;
}
