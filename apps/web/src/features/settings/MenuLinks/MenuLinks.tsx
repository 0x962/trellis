import { DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { MenuLink } from "@trellis/api";
import { IconButton, Menu, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { menuLinkIcons } from "../../navRows";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { MenuLinkEditor } from "./components/MenuLinkEditor";

export function MenuLinks() {
	const { saved, save } = useSettingsDraft();
	const [editor, setEditor] = useState<MenuLink | "new" | null>(null);
	const [busy, setBusy] = useState(false);
	if (!saved) return null;
	const links = saved.menuLinks ?? [];
	const update = async (menuLinks: MenuLink[]) => {
		setBusy(true);
		const stored = await save({ menuLinks });
		setBusy(false);
		if (stored) setEditor(null);
	};
	return (
		<div className="flex flex-col gap-3 py-4">
			<div className="flex justify-end">
				<Tooltip content="Add menu link">
					<IconButton label="Add menu link" icon={<Plus />} disabled={busy} onClick={() => setEditor("new")} />
				</Tooltip>
			</div>
			{links.length === 0 && <p className="text-sm text-fg-muted">No menu links.</p>}
			<ul className="flex flex-col">
				{links.map((link) => (
					<li key={link.id} className="status-row">
						<div className="status-row-summary">
							<button
								type="button"
								className="status-row-summary-button"
								aria-label={`Edit ${link.label}`}
								disabled={busy}
								onClick={() => setEditor(link)}
							>
								<span aria-hidden="true" className="status-row-icon">
									{menuLinkIcons[link.icon]}
								</span>
								<span className="status-row-copy">
									<span className="status-row-name">{link.label}</span>
									<span className="status-row-description truncate">{link.url}</span>
								</span>
							</button>
							<Menu
								label={`Actions for ${link.label}`}
								triggerTooltip={`Actions for ${link.label}`}
								trigger={<IconButton label={`Actions for ${link.label}`} icon={<DotsThree />} disabled={busy} />}
								items={[
									{ label: "Edit", icon: <PencilSimple />, onSelect: () => setEditor(link) },
									{
										label: "Delete",
										icon: <Trash />,
										danger: true,
										onSelect: () => void update(links.filter((item) => item.id !== link.id)),
									},
								]}
							/>
						</div>
					</li>
				))}
			</ul>
			{editor !== null && (
				<MenuLinkEditor
					key={editor === "new" ? "new" : editor.id}
					link={editor === "new" ? null : editor}
					busy={busy}
					onCancel={() => setEditor(null)}
					onSave={(link) =>
						update(editor === "new" ? [...links, link] : links.map((item) => (item.id === link.id ? link : item)))
					}
				/>
			)}
		</div>
	);
}
