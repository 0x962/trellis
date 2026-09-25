import { type MenuLink, type MenuLinkIcon, MenuLinkSchema } from "@trellis/api";
import { Button, Input, Select } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { menuLinkIcons } from "../../../../navRows";

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
	onCancel,
	onSave,
}: {
	link: MenuLink | null;
	busy: boolean;
	onCancel: () => void;
	onSave: (link: MenuLink) => Promise<void>;
}) {
	const [id] = useState(() => link?.id ?? crypto.randomUUID());
	const [label, setLabel] = useState(link?.label ?? "");
	const [url, setUrl] = useState(link?.url ?? "");
	const [icon, setIcon] = useState<MenuLinkIcon>(link?.icon ?? "Link");
	const [error, setError] = useState<string | null>(null);
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		const parsed = MenuLinkSchema.safeParse({ id, label, url, icon });
		if (!parsed.success) {
			setError(parsed.error.issues[0]!.message);
			return;
		}
		setError(null);
		void onSave(parsed.data);
	};
	return (
		<form aria-label={link ? "Edit menu link" : "Add menu link"} className="status-row-editor" onSubmit={handleSubmit}>
			<div className="status-row-editor-grid">
				<Input
					label="Label"
					value={label}
					maxLength={80}
					autoFocus
					disabled={busy}
					onChange={(event) => setLabel(event.target.value)}
				/>
				<div className="status-row-field">
					<span aria-hidden="true" className="status-row-field-label">
						Icon
					</span>
					<Select label="Icon" items={iconItems} value={icon} disabled={busy} onValueChange={setIcon} />
				</div>
			</div>
			<Input label="HTTPS URL" value={url} disabled={busy} onChange={(event) => setUrl(event.target.value)} />
			{error !== null && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
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
