import { DotsThree, Eye, PencilSimpleLine } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { LocalPrState } from "@trellis/api";
import { IconButton, Menu } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { failToast } from "../../../../../../../lib/failToast";

export type LocalStateMenuProps = {
	// The id of the pull request row that a ticket links.
	id: string;
	number: number;
	localState: LocalPrState;
};

// The item that flips the local review state of an open pull request. The
// state lives in Trellis only, so GitHub keeps its own draft flag.
export const localStateItem = (localState: LocalPrState): { label: string; next: LocalPrState } =>
	localState === "draft"
		? { label: "Mark ready for review", next: "ready" }
		: { label: "Mark as draft", next: "draft" };

// The ⋯ menu of the pull request sheet. The server event of the write
// refetches every row, so the glyph on the epic page, the ticket page, the
// Diffs list and the Needs you inbox follows the new state.
export function LocalStateMenu({ id, number, localState }: LocalStateMenuProps) {
	const { client } = useApp();
	const item = localStateItem(localState);
	const flip = useMutation({
		mutationFn: async () => await client.pullRequests.setLocalState({ id, localState: item.next }),
		onError: (error) => failToast(`#${number} did not change.`, error, () => flip.mutate()),
	});
	const label = `Actions for PR #${number}`;
	return (
		<Menu
			label={label}
			triggerTooltip={label}
			trigger={<IconButton label={label} icon={<DotsThree />} variant="default" />}
			items={[
				{
					label: item.label,
					icon: item.next === "ready" ? <Eye /> : <PencilSimpleLine />,
					disabled: flip.isPending,
					onSelect: () => flip.mutate(),
				},
			]}
		/>
	);
}
