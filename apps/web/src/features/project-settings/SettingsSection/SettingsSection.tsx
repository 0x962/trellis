import { SectionHeader } from "@trellis/ui";
import type { ReactNode } from "react";

export type SettingsSectionProps = {
	title: string;
	hint: string;
	// Quiet sm buttons on the right of the header.
	actions?: ReactNode;
	children: ReactNode;
};

// One section of the project settings: the header row, what the section
// sets, then its content.
export function SettingsSection({ title, hint, actions, children }: SettingsSectionProps) {
	return (
		<section aria-label={title} className="flex flex-col gap-3">
			<div className="flex flex-col gap-0.5">
				<SectionHeader title={title} actions={actions} />
				<p className="text-sm text-fg-muted text-pretty">{hint}</p>
			</div>
			<div className="flex min-w-0 flex-col gap-3">{children}</div>
		</section>
	);
}
