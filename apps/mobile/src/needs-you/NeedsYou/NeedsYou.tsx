import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { UnreachableServer } from "../../components/UnreachableServer";
import { getOrpc } from "../../lib/orpc";
import { keys, store } from "../../lib/store";
import { usePalette } from "../../theme/usePalette";
import { EmptyInbox } from "./components/EmptyInbox";
import { InboxList } from "./components/InboxList";
import { OfflineBanner } from "./components/OfflineBanner";
import { SendBackSheet } from "./components/SendBackSheet";
import { Toast } from "./components/Toast";
import { useInboxActions } from "./hooks/useInboxActions";
import { inboxInput } from "./utils/inboxCache";
import { isInboxEmpty, type OpenSections, type SectionKey } from "./utils/inboxRows";

// Done by agents today starts collapsed: it is awareness, not work.
const initialOpen: OpenSections = { review: true, failingCi: true, stalled: true, doneByAgentsToday: false };

const styles = StyleSheet.create({
	screen: { flex: 1 },
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});

// The stored server without its scheme, as the unreachable screen names it.
const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

// The Needs you tab: the four inbox sections in one FlashList, the swipe
// actions on a Review row, the empty state, the offline banner, and the
// unreachable-server screen. The inbox refetches on every mount, so a
// restored snapshot shows at once and the server answer replaces it.
export function NeedsYou() {
	const palette = usePalette();
	const orpc = getOrpc();
	const inboxQuery = useQuery({ ...orpc.inbox.get.queryOptions({ input: inboxInput }), refetchOnMount: "always" });
	const settings = useQuery(orpc.settings.get.queryOptions({}));
	const [open, setOpen] = useState(initialOpen);
	const [refreshing, setRefreshing] = useState(false);
	const actions = useInboxActions();
	const inbox = inboxQuery.data;

	if (inbox === undefined) {
		if (inboxQuery.isError) {
			return (
				<UnreachableServer
					host={hostOf(store.getString(keys.serverUrl)!)}
					onRetry={() => void inboxQuery.refetch()}
					onChangeServer={() => router.push("/setup")}
				/>
			);
		}
		return (
			<View style={styles.loading}>
				<ActivityIndicator color={palette.fgFaint} />
			</View>
		);
	}

	const toggle = (key: SectionKey) => setOpen((state) => ({ ...state, [key]: !state[key] }));
	const refresh = async () => {
		setRefreshing(true);
		await inboxQuery.refetch();
		setRefreshing(false);
	};

	return (
		<View style={styles.screen}>
			<OfflineBanner />
			{isInboxEmpty(inbox) ? (
				<EmptyInbox />
			) : (
				<InboxList
					inbox={inbox}
					open={open}
					onToggle={toggle}
					stalledHours={settings.data?.stalledHours}
					leaving={actions.leaving}
					onApprove={actions.approveRow}
					onSendBack={actions.openSendBack}
					onRowRemoved={actions.onRowRemoved}
					onOpenTicket={(identifier) => router.push({ pathname: "/ticket/[identifier]", params: { identifier } })}
					refreshing={refreshing}
					onRefresh={() => void refresh()}
				/>
			)}
			<SendBackSheet
				identifier={actions.sendBackFor?.identifier ?? ""}
				visible={actions.sendBackFor !== undefined}
				onCancel={actions.cancelSendBack}
				onSubmit={actions.submitSendBack}
			/>
			{actions.toast !== undefined && <Toast {...actions.toast} onDismiss={actions.dismissToast} />}
		</View>
	);
}
