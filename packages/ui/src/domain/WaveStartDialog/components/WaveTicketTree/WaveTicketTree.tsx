import { Checkbox } from "../../../../primitives/Checkbox";
import { StatusIcon, type StatusIconProps } from "../../../StatusIcon";
import { TicketId } from "../../../TicketId";

export type WaveStartTicket = {
	id: string;
	identifier: string;
	title: string;
	status: Pick<StatusIconProps, "category" | "color" | "reviewShape"> & { label: string };
	checked: boolean;
	disabled: boolean;
	waitsOn: readonly string[];
	note: string | null;
	tone: "muted" | "warning" | "danger" | "success";
	children: readonly WaveStartTicket[];
};

const tones = { muted: "text-fg-muted", warning: "text-warning", danger: "text-danger", success: "text-success" };

export function WaveTicketTree({
	tickets,
	onToggle,
	parent,
}: {
	tickets: readonly WaveStartTicket[];
	onToggle: (id: string, checked: boolean) => void;
	parent?: string;
}) {
	return (
		<ul className="wave-ticket-tree" aria-label={parent ? `Tickets that wait for ${parent}` : "Wave tickets"}>
			{tickets.map((ticket) => (
				<li key={ticket.id}>
					<div className="wave-ticket-row">
						<Checkbox
							label={`${ticket.waitsOn.length > 0 ? "Start anyway: " : "Start "}${ticket.identifier}: ${ticket.title}`}
							hideLabel
							checked={ticket.checked}
							disabled={ticket.disabled}
							onCheckedChange={(checked) => onToggle(ticket.id, checked)}
						/>
						<StatusIcon {...ticket.status} focusable={false} className="mt-0.5" />
						<div className="min-w-0 flex-1">
							<div className="wave-ticket-title">
								<TicketId id={ticket.identifier} />
								<span>{ticket.title}</span>
							</div>
							{ticket.note && (
								<p
									role={ticket.tone === "danger" ? "alert" : undefined}
									className={`mt-1 text-sm wrap-anywhere ${tones[ticket.tone]}`}
								>
									{ticket.note}
								</p>
							)}
						</div>
					</div>
					{ticket.children.length > 0 && (
						<WaveTicketTree tickets={ticket.children} onToggle={onToggle} parent={ticket.identifier} />
					)}
				</li>
			))}
		</ul>
	);
}
