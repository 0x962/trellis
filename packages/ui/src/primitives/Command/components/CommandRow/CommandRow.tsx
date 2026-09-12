import { Command as Cmdk } from "cmdk";
import type { ReactNode } from "react";
import { cx } from "../../../../utils/cx";
import { Kbd } from "../../../Kbd";
import { commandRowClass } from "./rowClass";

export type CommandRowProps = {
	// The value `onSelect` receives and the option's identity in the list.
	// A ticket row carries its identifier.
	value: string;
	label: string;
	// Extra words the filter matches, beside the value and the label.
	keywords?: string[];
	// Muted text after the label: the current status, a project path, a
	// command to paste.
	sub?: string;
	// Draws the sub in faint mono, for a ticket ID.
	mono?: boolean;
	// Faint mono text before the label, such as a ticket ID.
	prefix?: string;
	// A node drawn as is before the label, such as a project key badge. It
	// takes the place of the 14 px icon box.
	leading?: ReactNode;
	// The key caps on the right, in press order.
	keys?: readonly string[];
	icon?: ReactNode;
	onSelect: () => void;
};

// One option of a Command list. The height is fixed, so a list that grows
// while a response arrives moves nothing that is already on screen.
export function CommandRow({
	value,
	label,
	keywords,
	sub,
	mono,
	prefix,
	leading,
	keys,
	icon,
	onSelect,
}: CommandRowProps) {
	return (
		<Cmdk.Item value={value} keywords={[label, ...(keywords ?? [])]} onSelect={onSelect} className={commandRowClass}>
			{leading}
			{icon && (
				<span
					aria-hidden="true"
					className="inline-flex size-3.5 shrink-0 items-center justify-center text-fg-muted *:size-full"
				>
					{icon}
				</span>
			)}
			{prefix !== undefined && <span className="shrink-0 font-mono text-sm text-fg-faint tabular">{prefix}</span>}
			{/* A command label is short and names the action, so a long sub truncates first. */}
			<span className={sub === undefined ? "truncate" : "shrink-0"}>{label}</span>
			{sub !== undefined && (
				<span
					className={cx(
						"min-w-0 truncate",
						mono === true ? "font-mono text-xs text-fg-faint" : "text-sm text-fg-muted",
					)}
				>
					{sub}
				</span>
			)}
			{keys !== undefined && keys.length > 0 && (
				<span className="ml-auto flex shrink-0 items-center gap-1">
					{keys.map((cap) => (
						<Kbd key={cap}>{cap}</Kbd>
					))}
				</span>
			)}
		</Cmdk.Item>
	);
}
