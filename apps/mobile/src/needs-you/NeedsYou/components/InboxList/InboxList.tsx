import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import type { Inbox, TicketSummary } from "@trellis/api";
import { type ReactElement, useMemo } from "react";
import { StatusIcon } from "../../../../components/StatusIcon";
import { formatCount } from "../../../../lib/format";
import { layout } from "../../../../theme/layout";
import { usePalette } from "../../../../theme/usePalette";
import { type InboxItem, inboxRows, type OpenSections, type SectionKey } from "../../utils/inboxRows";
import { FailingCiRow } from "../FailingCiRow";
import { InboxRow } from "../InboxRow";
import { SectionHeader } from "../SectionHeader";
import { SwipeRow } from "../SwipeRow";

export type InboxListProps = {
	inbox: Inbox;
	open: OpenSections;
	onToggle: (key: SectionKey) => void;
	// The hours a started ticket may sit quiet before Stalled lists it.
	// Undefined while the settings load.
	stalledHours: number | undefined;
	// The rows on their way out of the list.
	leaving: ReadonlySet<string>;
	onApprove: (ticket: TicketSummary) => void;
	onSendBack: (ticket: TicketSummary) => void;
	onRowRemoved: (id: string) => void;
	onOpenTicket: (identifier: string) => void;
	refreshing: boolean;
	onRefresh: () => void;
};

const sectionNames: Record<SectionKey, string> = {
	review: "Review",
	failingCi: "Failing CI",
	stalled: "Stalled",
	doneByAgentsToday: "Done by agents today",
};

const keyOf = (item: InboxItem) => (item.type === "header" ? `header-${item.key}` : `${item.key}-${item.ticket.id}`);

const typeOf = (item: InboxItem) => item.type;

// The four sections in one FlashList. A header and a row are two item
// types, so a recycled view never turns from one into the other. Every row
// has the same fixed height.
export function InboxList({
	inbox,
	open,
	onToggle,
	stalledHours,
	leaving,
	onApprove,
	onSendBack,
	onRowRemoved,
	onOpenTicket,
	refreshing,
	onRefresh,
}: InboxListProps) {
	const palette = usePalette();
	const items = useMemo(() => inboxRows(inbox, open), [inbox, open]);

	const icons: Record<SectionKey, ReactElement> = {
		review: <StatusIcon category="review" />,
		failingCi: <Ionicons name="close" size={layout.statusIcon} color={palette.danger} />,
		stalled: <StatusIcon category="started" />,
		doneByAgentsToday: <StatusIcon category="done" />,
	};

	const hintOf = (key: SectionKey, total: number) => {
		if (key === "review") return "swipe to act";
		if (key === "stalled") return stalledHours === undefined ? undefined : `no activity for ${stalledHours}h`;
		if (key === "doneByAgentsToday") return open[key] ? "Hide" : `Show ${formatCount(total)}`;
		return undefined;
	};

	// `extraData` names every value the renderer reads besides the item, so
	// the list redraws its rows when one of them changes.
	const renderItem = ({ item }: ListRenderItemInfo<InboxItem>) => {
		if (item.type === "header") {
			return (
				<SectionHeader
					name={sectionNames[item.key]}
					count={item.total}
					icon={icons[item.key]}
					hint={hintOf(item.key, item.total)}
					open={open[item.key]}
					onToggle={() => onToggle(item.key)}
				/>
			);
		}
		const { ticket } = item;
		const review = item.key === "review";
		const openTicket = () => onOpenTicket(ticket.identifier);
		return (
			<SwipeRow
				identifier={ticket.identifier}
				onApprove={review ? () => onApprove(ticket) : undefined}
				onSendBack={review ? () => onSendBack(ticket) : undefined}
				removing={leaving.has(ticket.id)}
				onRemoved={() => onRowRemoved(ticket.id)}
			>
				{item.key === "failingCi" ? (
					<FailingCiRow ticket={ticket} onPress={openTicket} />
				) : (
					<InboxRow ticket={ticket} onPress={openTicket} />
				)}
			</SwipeRow>
		);
	};

	return (
		<FlashList
			testID="inbox-list"
			data={items}
			extraData={{ open, stalledHours, leaving, palette }}
			keyExtractor={keyOf}
			getItemType={typeOf}
			renderItem={renderItem}
			refreshing={refreshing}
			onRefresh={onRefresh}
		/>
	);
}
