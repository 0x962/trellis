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
	// Draws the sub in mono, for a branch name, an identifier, or a command.
	mono?: boolean;
	// The key caps on the right, in press order.
	keys?: readonly string[];
	icon?: ReactNode;
	onSelect: () => void;
};

// One option of a Command list. The height is fixed, so a list that grows
// while a response arrives moves nothing that is already on screen.
export function CommandRow({ value, label, keywords, sub, mono, keys, icon, onSelect }: CommandRowProps) {
	return (
		<Cmdk.Item value={value} keywords={[label, ...(keywords ?? [])]} onSelect={onSelect} className={commandRowClass}>
			{icon && (
				<span
					aria-hidden="true"
					className="inline-flex size-3.5 shrink-0 items-center justify-center text-fg-muted *:size-full"
				>
					{icon}
				</span>
			)}
			<span className="truncate">{label}</span>
			{sub !== undefined && (
				<span className={cx("truncate text-sm text-fg-muted", mono === true && "font-mono text-xs")}>{sub}</span>
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
