import { Link } from "@tanstack/react-router";
import { projectSlashPath } from "../../../../lib/projectPath";
import type { useNativeAttention } from "../../hooks/useNativeAttention";

export function NativeAttention({ attention }: { attention: ReturnType<typeof useNativeAttention> }) {
	if (!attention.items.length && !attention.error) return null;
	return (
		<section aria-label="Agent needs attention" className="flex flex-col gap-3 p-4">
			<h2 className="text-base font-medium">Agent needs attention</h2>
			{attention.error && (
				<p role="alert" className="text-sm text-danger">
					{attention.error.message}
				</p>
			)}
			<ul className="flex flex-col gap-3">
				{attention.items.map(({ run, reason }) => (
					<li key={run.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
						{run.ticketIdentifier ? (
							<Link
								className="text-sm font-medium underline"
								to="/t/$identifier"
								params={{ identifier: run.ticketIdentifier }}
								hash={`attempt-${run.id}`}
							>
								{run.ticketIdentifier} · {run.name}
							</Link>
						) : (
							<Link
								className="text-sm font-medium underline"
								to="/p/$"
								params={{ _splat: `${projectSlashPath(run.projectPath)}/settings/manager` }}
								search={{}}
							>
								{run.projectPath} · {run.name}
							</Link>
						)}
						<p className="break-words text-sm text-fg-muted">{reason}</p>
					</li>
				))}
			</ul>
		</section>
	);
}
