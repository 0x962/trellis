import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { SettingsRow } from "../SettingsRow";

// The version, the checkout, and the commit that `system.health` reports for
// the running server. `trellis install` from another checkout replaces the
// server, and this row then names that checkout. A server of an earlier
// release reports no source, and the row does not show.
export function ServerSource() {
	const { orpc } = useApp();
	const health = useQuery(orpc.system.health.queryOptions({})).data;
	if (health?.source === undefined) return null;

	const { checkout, commit } = health.source;
	return (
		<SettingsRow label="Running server" hint="The checkout and the commit that this server runs.">
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
				<dt className="text-fg-muted">Version</dt>
				<dd className="tabular-nums">
					<code className="text-fg">{health.version}</code>
				</dd>
				<dt className="text-fg-muted">Checkout</dt>
				<dd className="break-all">
					<code className="text-fg">{checkout}</code>
				</dd>
				<dt className="text-fg-muted">Commit</dt>
				<dd className="break-all">
					{commit === null ? (
						<span className="text-fg-muted">Not a git checkout</span>
					) : (
						<code className="text-fg">{commit}</code>
					)}
				</dd>
			</dl>
		</SettingsRow>
	);
}
