import { create } from "zustand";

type ShortcutHelpState = { open: boolean };

// Whether the shortcut help sheet is open. The `?` key, the sidebar help
// button, and the sheet itself read and write this one value.
export const useShortcutHelpStore = create<ShortcutHelpState>()(() => ({ open: false }));

export const openShortcutHelp = () => useShortcutHelpStore.setState({ open: true });

export const closeShortcutHelp = () => useShortcutHelpStore.setState({ open: false });
