import { useQuery } from "@tanstack/react-query";
import { lanAddress, pairLink } from "@trellis/api";
import { lazy, Suspense } from "react";
import { useApp } from "../../../lib/appContext";
import { CliLine } from "../../shell/CliLine";
import { SettingsRow } from "../SettingsRow";

// The QR encoder loads only when a code is on screen.
const PairQr = lazy(() => import("./components/PairQr").then((module) => ({ default: module.PairQr })));

// launchd restarts the server with TRELLIS_HOST=0.0.0.0, so it answers on
// every address of this computer.
const command = "trellis install --host 0.0.0.0";

const caution = "CAUTION: The server has no sign-in. Anyone on the network can reach it.";

// How a phone finds this server. `system.health` lists the URLs the server
// answers on. A network address gets a QR code of the pair link, which the
// phone app scans. A server on loopback only gets the command that opens
// it, with the caution before the command.
export function PairPhone() {
	const { orpc } = useApp();
	const health = useQuery(orpc.system.health.queryOptions({})).data;
	if (health === undefined) return null;

	const address = lanAddress(health.addresses);
	return (
		<SettingsRow
			label="Pair a phone"
			hint="Scan the code with the trellis phone app to pair the phone with this server."
		>
			{address === undefined ? (
				<div className="flex flex-col items-start gap-2">
					<p className="text-sm text-fg">Open the server to the network to pair a phone.</p>
					<p className="text-sm text-fg-muted">{caution}</p>
					<CliLine command={command} />
				</div>
			) : (
				<div className="flex flex-wrap items-start gap-4">
					<Suspense fallback={<div className="size-40 shrink-0 rounded-md bg-qr-paper" />}>
						<PairQr link={pairLink(address)} />
					</Suspense>
					<div className="flex min-w-0 flex-col gap-1">
						<p className="text-sm text-fg-muted">Or type this URL in the app:</p>
						<code className="text-sm text-fg">{address}</code>
						<p className="text-sm text-fg-muted">{caution}</p>
					</div>
				</div>
			)}
		</SettingsRow>
	);
}
