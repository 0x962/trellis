import { type ReactNode, useId } from "react";

export type SettingsListRowProps = {
	label: string;
	description: string;
	icon: ReactNode;
	actions: ReactNode;
	disabled?: boolean;
	onEdit: () => void;
	children?: ReactNode;
};

export function SettingsListRow({
	label,
	description,
	icon,
	actions,
	disabled,
	onEdit,
	children,
}: SettingsListRowProps) {
	const editorId = useId();
	return (
		<li className="status-row">
			<div className="status-row-summary">
				<button
					type="button"
					className="status-row-summary-button"
					aria-label={`Edit ${label}`}
					aria-expanded={Boolean(children)}
					aria-controls={children ? editorId : undefined}
					disabled={disabled}
					onClick={onEdit}
				>
					<span aria-hidden="true" className="status-row-icon">
						{icon}
					</span>
					<span className="status-row-copy">
						<span className="status-row-name">{label}</span>
						<span className="status-row-description">{description}</span>
					</span>
				</button>
				{actions}
			</div>
			{children && <div id={editorId}>{children}</div>}
		</li>
	);
}
