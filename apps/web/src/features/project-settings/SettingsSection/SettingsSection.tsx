import type { ReactNode } from "react";

export type SettingsSectionProps = {
	title: string;
	hint: string;
	actions?: ReactNode;
	children: ReactNode;
};

export function SettingsSection({ title, hint, actions, children }: SettingsSectionProps) {
	return (
		<section className="grid gap-4 border-b border-border py-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
			<div>
				<div className="flex items-center gap-2">
					<h2 className="font-medium text-fg">{title}</h2>
					{actions}
				</div>
				<p className="mt-0.5 text-sm text-fg-muted text-pretty">{hint}</p>
			</div>
			<div className="flex min-w-0 flex-col gap-3">{children}</div>
		</section>
	);
}
