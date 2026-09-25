import { DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { MenuLink } from "@trellis/api";
import { EmptyState, IconButton, Menu, SettingsListRow, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { menuLinkIcons } from "../../navRows";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { MenuLinkEditor } from "./components/MenuLinkEditor";

export function MenuLinks() {
	const { saved, save } = useSettingsDraft();
	const [editingLink, setEditingLink] = useState<MenuLink | "new" | null>(null);
	const [busy, setBusy] = useState(false);
	if (!saved) return null;
	const menuLinks = saved.menuLinks ?? [];
	const saveLinks = async (nextMenuLinks: MenuLink[]) => {
		setBusy(true);
		const savedSettings = await save({ menuLinks: nextMenuLinks });
		setBusy(false);
		if (savedSettings) setEditingLink(null);
	};
	const linkEditor = editingLink !== null && (
		<MenuLinkEditor
			key={editingLink === "new" ? "new" : editingLink.id}
			link={editingLink === "new" ? null : editingLink}
			busy={busy}
			onCancel={() => setEditingLink(null)}
			onSave={(link) =>
				saveLinks(
					editingLink === "new" ? [...menuLinks, link] : menuLinks.map((item) => (item.id === link.id ? link : item)),
				)
			}
		/>
	);
	return (
		<div className="flex flex-col gap-3 py-4">
			<div className="flex justify-end">
				<Tooltip content="Add menu link">
					<IconButton label="Add menu link" icon={<Plus />} disabled={busy} onClick={() => setEditingLink("new")} />
				</Tooltip>
			</div>
			{menuLinks.length === 0 && <EmptyState title="No menu links." />}
			<ul className="flex flex-col">
				{menuLinks.map((link) => (
					<SettingsListRow
						key={link.id}
						label={link.label}
						description={link.url}
						icon={menuLinkIcons[link.icon]}
						disabled={busy}
						onEdit={() => setEditingLink(link)}
						actions={
							<Menu
								label={`Actions for ${link.label}`}
								triggerTooltip={`Actions for ${link.label}`}
								trigger={<IconButton label={`Actions for ${link.label}`} icon={<DotsThree />} disabled={busy} />}
								items={[
									{ label: "Edit", icon: <PencilSimple />, onSelect: () => setEditingLink(link) },
									{
										label: "Delete",
										icon: <Trash />,
										danger: true,
										onSelect: () => void saveLinks(menuLinks.filter((item) => item.id !== link.id)),
									},
								]}
							/>
						}
					>
						{editingLink !== "new" && editingLink?.id === link.id && linkEditor}
					</SettingsListRow>
				))}
			</ul>
			{editingLink === "new" && linkEditor}
		</div>
	);
}
