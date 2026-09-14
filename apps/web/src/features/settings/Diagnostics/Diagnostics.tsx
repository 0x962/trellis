import { useQuery } from "@tanstack/react-query";
import { RuntimeDiagnostics } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export function Diagnostics() {
	const { orpc } = useApp();
	const report = useQuery({ ...orpc.system.doctor.queryOptions({ input: {} }), refetchInterval: 5000 });
	if (report.isError)
		return (
			<p role="alert" className="text-sm text-danger">
				{report.error.message}
			</p>
		);
	if (report.isPending)
		return (
			<p role="status" className="text-sm text-fg-muted">
				Load diagnostics…
			</p>
		);
	return <RuntimeDiagnostics {...report.data} />;
}
