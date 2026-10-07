import { DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { MenuLink } from "@trellis/api";
import { ConfirmDialog, EmptyState, FormStatus, IconButton, Menu, SettingsListRow, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";
import { menuLinkIcons } from "../../navRows";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { MenuLinkEditor } from "./components/MenuLinkEditor";

type LinkWriteCallbacks = {
	onStarted: () => void;
	onStored: () => void;
	onFailed: () => void;
};

export function MenuLinks() {
	const { saved, save } = useSettingsDraft();
	const [editingLink, setEditingLink] = useState<MenuLink | "new" | null>(null);
	const [deletingLink, setDeletingLink] = useState<MenuLink | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const writeInProgress = useRef(false);
	if (!saved) return null;
	const menuLinks = saved.menuLinks ?? [];
	const saveLinks = async (nextMenuLinks: MenuLink[], callbacks: LinkWriteCallbacks) => {
		if (writeInProgress.current) return;
		writeInProgress.current = true;
		setBusy(true);
		callbacks.onStarted();
		const stored = await save(
			{ menuLinks: nextMenuLinks },
			{ onStored: callbacks.onStored, retry: () => void saveLinks(nextMenuLinks, callbacks) },
		);
		writeInProgress.current = false;
		setBusy(false);
		if (stored === undefined) callbacks.onFailed();
	};
	const removeLink = () => {
		const link = deletingLink!;
		void saveLinks(
			menuLinks.filter((item) => item.id !== link.id),
			{
				onFailed: () => setDeleteError("The menu link did not delete."),
				onStarted: () => setDeleteError(null),
				onStored: () => {
					setDeletingLink(null);
					if (editingLink !== "new" && editingLink?.id === link.id) setEditingLink(null);
				},
			},
		);
	};
	const linkEditor = editingLink !== null && (
		<MenuLinkEditor
			key={editingLink === "new" ? "new" : editingLink.id}
			link={editingLink === "new" ? null : editingLink}
			busy={busy}
			saveError={saveError}
			onCancel={() => {
				setSaveError(null);
				setEditingLink(null);
			}}
			onSave={async (link) => {
				await saveLinks(
					editingLink === "new" ? [...menuLinks, link] : menuLinks.map((item) => (item.id === link.id ? link : item)),
					{
						onFailed: () => setSaveError("The menu link did not save."),
						onStored: () => setEditingLink(null),
						onStarted: () => setSaveError(null),
					},
				);
			}}
		/>
	);
	return (
		<div className="flex flex-col gap-3 py-4">
			<div className="flex justify-end">
				<Tooltip content="Add menu link">
					<IconButton
						label="Add menu link"
						icon={<Plus />}
						disabled={busy}
						onClick={() => {
							setSaveError(null);
							setEditingLink("new");
						}}
					/>
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
						onEdit={() => {
							setSaveError(null);
							setEditingLink(link);
						}}
						actions={
							<Menu
								label={`Actions for ${link.label}`}
								triggerTooltip={`Actions for ${link.label}`}
								trigger={<IconButton label={`Actions for ${link.label}`} icon={<DotsThree />} disabled={busy} />}
								items={[
									{
										label: "Edit",
										icon: <PencilSimple />,
										disabled: busy,
										onSelect: () => {
											setSaveError(null);
											setEditingLink(link);
										},
									},
									{
										label: "Delete",
										icon: <Trash />,
										danger: true,
										disabled: busy,
										onSelect: () => {
											setDeleteError(null);
											setDeletingLink(link);
										},
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
			<ConfirmDialog
				open={deletingLink !== null}
				title={`Delete ${deletingLink?.label ?? "menu link"}?`}
				description="This action removes the link from the menu."
				confirmLabel="Delete menu link"
				danger
				processing={busy}
				onCancel={() => {
					if (busy) return;
					setDeleteError(null);
					setDeletingLink(null);
				}}
				onConfirm={() => void removeLink()}
			>
				{deleteError !== null && <FormStatus status="error" message={deleteError} />}
			</ConfirmDialog>
		</div>
	);
}
