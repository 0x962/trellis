import { toast } from "@trellis/ui";
import { useRecentChoices } from "../../../features/agents/AssignAgent/recentChoices/recentChoices";
import { useBroadcastStore } from "../../../features/agents/BroadcastDialog/broadcastStore";
import { paletteOpener, useCommandStore } from "../../../features/command/commandStore";
import { useConfirmStore } from "../../../features/command/confirmStore";
import { useComposerStore } from "../../../features/composer/composerStore";
import {
	lastFocusedRun,
	runExpansionByDiff,
	runListOffsets,
	runTreeStates,
} from "../../../features/reviews/FlowRuns/runViewState/runViewState";
import { useStatusPaneWidth } from "../../../features/sessions/SessionConversation/components/AgentStatusUpdates/components/useStatusPaneWidth/useStatusPaneWidth";
import { useSessionComposerStore } from "../../../features/sessions/sessionComposerStore";
import { useSlashMenuStore } from "../../../features/ticket/Description/components/LazyEditor/components/SlashMenu/SlashMenu";
import { usePickerStore } from "../../../features/ticket/stores/pickerStore";
import { useSaveStatusStore } from "../../../features/ticket/stores/saveStatusStore";
import { actorStorageKey, setActorName } from "../../../lib/actor";
import { usePageSheetStore } from "../../../stores/pageSheetStore";
import { usePageTabsStore } from "../../../stores/pageTabsStore";
import { useProjectMoreStore } from "../../../stores/projectMoreStore";
import { useUiStore } from "../../../stores/uiStore";

export const resetStoryState = (actor: string | null = "Storybook") => {
	toast.dismiss();
	runExpansionByDiff.clear();
	runTreeStates.clear();
	runListOffsets.clear();
	lastFocusedRun.id = null;
	for (const storage of [localStorage, sessionStorage]) {
		for (const key of Object.keys(storage)) {
			if (key.startsWith("trellis")) storage.removeItem(key);
		}
	}
	if (actor === null) localStorage.removeItem(actorStorageKey);
	else setActorName(actor);
	usePageSheetStore.setState(usePageSheetStore.getInitialState(), true);
	usePageTabsStore.setState(usePageTabsStore.getInitialState(), true);
	useProjectMoreStore.setState(useProjectMoreStore.getInitialState(), true);
	useUiStore.setState(useUiStore.getInitialState(), true);
	useRecentChoices.setState(useRecentChoices.getInitialState(), true);
	useBroadcastStore.setState(useBroadcastStore.getInitialState(), true);
	useCommandStore.setState(useCommandStore.getInitialState(), true);
	useConfirmStore.setState(useConfirmStore.getInitialState(), true);
	useComposerStore.setState(useComposerStore.getInitialState(), true);
	useStatusPaneWidth.setState(useStatusPaneWidth.getInitialState(), true);
	useSessionComposerStore.setState(useSessionComposerStore.getInitialState(), true);
	useSlashMenuStore.setState(useSlashMenuStore.getInitialState(), true);
	usePickerStore.setState(usePickerStore.getInitialState(), true);
	useSaveStatusStore.setState(useSaveStatusStore.getInitialState(), true);
	paletteOpener.current = null;
};
