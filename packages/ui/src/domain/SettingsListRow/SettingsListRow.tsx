import { type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";

export type SettingsListRowProps = {
	label: string;
	badge?: string;
	description: string;
	wrapDescription?: boolean;
	icon: ReactNode;
	actions: ReactNode;
	disabled?: boolean;
	onEdit: () => void;
	children?: ReactNode;
};

export function SettingsListRow({
	label,
	badge,
	description,
	wrapDescription,
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
					aria-label={`Edit ${label}${badge ? `, ${badge}` : ""}`}
					aria-expanded={Boolean(children)}
					aria-controls={children ? editorId : undefined}
					disabled={disabled}
					onClick={onEdit}
				>
					<span aria-hidden="true" className="status-row-icon">
						{icon}
					</span>
					<span className="status-row-copy">
						<span className="status-row-name-line">
							<span className="status-row-name">{label}</span>
							{badge && <span className="status-row-default">{badge}</span>}
						</span>
						<span className={cx("status-row-description", wrapDescription && "whitespace-normal text-pretty")}>
							{description}
						</span>
					</span>
				</button>
				{actions}
			</div>
			{children && <div id={editorId}>{children}</div>}
		</li>
	);
}
