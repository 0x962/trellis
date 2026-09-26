import { FieldHint } from "@trellis/ui";
import type { ReactNode } from "react";

export type SettingsSectionProps = {
	title: string;
	hint?: string;
	actions?: ReactNode;
	children: ReactNode;
};

export function SettingsSection({ title, hint, actions, children }: SettingsSectionProps) {
	return (
		<section aria-label={title} className="project-settings-section">
			<header className="project-settings-heading">
				<div className="min-w-0">
					<h2 className="text-xl font-semibold text-fg">{title}</h2>
					{hint && <FieldHint className="mt-2">{hint}</FieldHint>}
				</div>
				{actions}
			</header>
			<div className="project-settings-fields">{children}</div>
		</section>
	);
}
