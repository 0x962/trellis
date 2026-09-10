import type { ReactNode } from "react";

export type SettingsRowProps = {
	label: string;
	// What the setting does, in the left column under the label.
	hint: string;
	children: ReactNode;
};

// One setting: its name and description on the left, its control on the
// right. Under 768 px the control stacks under the description.
export function SettingsRow({ label, hint, children }: SettingsRowProps) {
	return (
		<div data-settings-row="" className="flex gap-8 border-b border-border py-5 max-md:flex-col max-md:gap-3">
			<div className="w-48 shrink-0 max-md:w-auto">
				<div className="font-medium text-fg">{label}</div>
				<p className="mt-0.5 text-sm text-fg-muted">{hint}</p>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
		</div>
	);
}
