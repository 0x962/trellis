import { useQuery } from "@tanstack/react-query";
import { lanAddress, pairLink } from "@trellis/api";
import { IconButton } from "@trellis/ui";
import { Copy } from "lucide-react";
import { lazy, Suspense } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsRow } from "../SettingsRow";

// The QR encoder loads only when a code is on screen.
const PairQr = lazy(() => import("./components/PairQr").then((module) => ({ default: module.PairQr })));

// launchd restarts the server with TRELLIS_HOST=0.0.0.0, so it answers on
// every address of this computer.
const command = "trellis install --host 0.0.0.0";

const noAuth = "The server has no auth, so anyone on the network can reach it.";

// How a phone finds this server. `system.health` lists the URLs the server
// answers on. A network address gets a QR code of the pair link, which the
// phone app scans; a server on loopback only gets the command that opens it.
export function PairPhone() {
	const { orpc } = useApp();
	const health = useQuery(orpc.system.health.queryOptions({})).data;
	if (health === undefined) return null;

	const address = lanAddress(health.addresses);
	return (
		<SettingsRow label="Pair a phone" hint="Scan the code in the trellis phone app to connect it to this server.">
			{address === undefined ? (
				<div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
					<p className="text-sm text-fg">The server listens on this computer only, so a phone cannot reach it.</p>
					<p className="text-sm text-fg-muted">Run this command to open it to the network:</p>
					<div className="flex items-center gap-2">
						<code className="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-xs text-fg-muted">
							{command}
						</code>
						<IconButton
							label="Copy the pairing command"
							icon={<Copy />}
							onClick={() => void navigator.clipboard.writeText(command)}
						/>
					</div>
					<p className="text-sm text-fg-muted">{noAuth}</p>
				</div>
			) : (
				<div className="flex flex-wrap items-start gap-4">
					<Suspense fallback={<div className="size-40 shrink-0 rounded-md bg-qr-paper" />}>
						<PairQr link={pairLink(address)} />
					</Suspense>
					<div className="flex min-w-0 flex-col gap-1">
						<p className="text-sm text-fg-muted">Or type this URL in the app:</p>
						<code className="font-mono text-sm text-fg">{address}</code>
						<p className="text-sm text-fg-muted">{noAuth}</p>
					</div>
				</div>
			)}
		</SettingsRow>
	);
}
