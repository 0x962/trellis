import type { MenuLink, MenuLinkIcon } from "@trellis/api";
import { Button, FormStatus, Input, Select } from "@trellis/ui";
import { type FormEvent, useRef, useState } from "react";
import { menuLinkIcons } from "../../../../navRows";
import { parseMenuLink } from "./menuLinkValidation";

const iconItems: { value: MenuLinkIcon; label: string; icon: React.ReactNode }[] = [
	{ value: "Link", label: "Link", icon: menuLinkIcons.Link },
	{ value: "GithubLogo", label: "GitHub", icon: menuLinkIcons.GithubLogo },
	{ value: "Play", label: "Play", icon: menuLinkIcons.Play },
	{ value: "Globe", label: "Globe", icon: menuLinkIcons.Globe },
	{ value: "BookOpen", label: "Book", icon: menuLinkIcons.BookOpen },
	{ value: "ChartLine", label: "Chart", icon: menuLinkIcons.ChartLine },
];

export function MenuLinkEditor({
	link,
	busy,
	saveError = null,
	onCancel,
	onSave,
}: {
	link: MenuLink | null;
	busy: boolean;
	saveError?: string | null;
	onCancel: () => void;
	onSave: (link: MenuLink) => Promise<void>;
}) {
	const [id] = useState(() => link?.id ?? crypto.randomUUID());
	const [label, setLabel] = useState(link?.label ?? "");
	const [url, setUrl] = useState(link?.url ?? "");
	const [icon, setIcon] = useState<MenuLinkIcon>(link?.icon ?? "Link");
	const [errors, setErrors] = useState<{ label?: string; url?: string }>({});
	const labelRef = useRef<HTMLInputElement>(null);
	const urlRef = useRef<HTMLInputElement>(null);
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		const parsed = parseMenuLink({ id, label, url, icon });
		if (!parsed.success) {
			setErrors(parsed.errors);
			({ label: labelRef, url: urlRef })[parsed.firstInvalid].current?.focus();
			return;
		}
		setErrors({});
		void onSave(parsed.data);
	};
	return (
		<form aria-label={link ? "Edit menu link" : "Add menu link"} className="status-row-editor" onSubmit={handleSubmit}>
			<div className="status-row-editor-grid">
				<Input
					label="Label"
					value={label}
					autoFocus
					ref={labelRef}
					error={errors.label}
					disabled={busy}
					onChange={(event) => {
						setLabel(event.target.value);
						setErrors((current) => ({ ...current, label: undefined }));
					}}
				/>
				<div className="status-row-field">
					<span aria-hidden="true" className="status-row-field-label">
						Icon
					</span>
					<Select label="Icon" items={iconItems} value={icon} disabled={busy} onValueChange={setIcon} />
				</div>
			</div>
			<Input
				label="HTTPS URL"
				value={url}
				ref={urlRef}
				error={errors.url}
				disabled={busy}
				onChange={(event) => {
					setUrl(event.target.value);
					setErrors((current) => ({ ...current, url: undefined }));
				}}
			/>
			<FormStatus status={busy ? "saving" : saveError === null ? "idle" : "error"} message={saveError ?? undefined} />
			<div className="status-row-editor-buttons justify-end">
				<Button type="button" disabled={busy} onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" processing={busy}>
					Save
				</Button>
			</div>
		</form>
	);
}
