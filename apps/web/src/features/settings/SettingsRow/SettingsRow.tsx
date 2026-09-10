import type { ReactNode } from "react";

export type SettingsRowProps = {
	label: string;
	// What the setting does, under the label.
	hint: string;
	children: ReactNode;
};

// One setting: its name and description on the left and its control on the
// right. Below 768 px the name and description stack above the control.
export function SettingsRow({ label, hint, children }: SettingsRowProps) {
	return (
		<div data-settings-row="" className="flex gap-6 py-4 max-md:flex-col max-md:gap-2">
			<div className="w-48 shrink-0 max-md:w-auto">
				<div className="text-base font-medium text-fg">{label}</div>
				<p className="mt-0.5 text-sm text-fg-muted">{hint}</p>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
		</div>
	);
}
