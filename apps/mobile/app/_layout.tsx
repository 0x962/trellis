import Ionicons from "@expo/vector-icons/Ionicons";
import { JetBrainsMono_400Regular, useFonts } from "@expo-google-fonts/jetbrains-mono";
import { QueryClientProvider } from "@tanstack/react-query";
import { Tabs } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { startLive } from "../src/lib/live";
import { queryClient } from "../src/lib/queryClient";
import { restoreClient, subscribePersist } from "../src/lib/storage";
import { keys, store } from "../src/lib/store";
import { useStoredString } from "../src/lib/useStoredString";
import { useInboxBadge } from "../src/needs-you/NeedsYou/hooks/useInboxBadge";
import { tokens } from "../src/theme/tokens";
import { usePalette } from "../src/theme/usePalette";
import { useTheme } from "../src/theme/useTheme";

type IconName = keyof typeof Ionicons.glyphMap;

// The tab navigator of the app. Each tab is a group that holds its own stack,
// so the four tabs render no header of their own. The setup screen sits
// beside them without a tab bar item and carries its own header. The pair
// route also has no tab bar item: it only sends a pair link on to setup.
//
// The four tabs are behind the guard: without a stored server URL and name,
// only the setup screen exists, so the app shows setup until both are saved.
export default function RootLayout() {
	const [url] = useStoredString(keys.serverUrl);
	const [name] = useStoredString(keys.actorName);
	const configured = Boolean(url) && Boolean(name);
	const { resolved } = useTheme();
	const palette = usePalette();
	const badge = useInboxBadge(queryClient);
	// Identifiers, branch names, and versions paint in JetBrains Mono. React
	// Native draws a family it holds no file for in the system font, so the
	// screens wait for the file.
	const [fontLoaded] = useFonts({ [tokens.font.mono]: JetBrainsMono_400Regular });

	// A tab's options. The accessibility label is the title itself, so a
	// screen reader and a test both find the tab by its name.
	const tab = (title: string, icon: IconName, tabBarBadge?: number) => ({
		title,
		tabBarAccessibilityLabel: title,
		tabBarBadge,
		tabBarBadgeStyle: { backgroundColor: palette.danger, color: tokens.onSaturated, fontSize: tokens.text.xs },
		tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) => (
			<Ionicons name={icon} size={size} color={focused ? palette.accent : palette.fgMuted} />
		),
	});

	// The header of the setup screen. The tab navigator hands it the screen's
	// own navigator, which knows whether a screen sits under this one.
	const setupHeader = ({ navigation }: { navigation: { canGoBack: () => boolean; goBack: () => void } }) => (
		<ScreenHeader title="Server" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
	);

	useEffect(() => {
		// The snapshot is as old as the last run of the app. Every query in it
		// keeps its data until an event says otherwise, so the restore marks
		// them all stale and the screens that mount them fetch once.
		void restoreClient(queryClient, store).then(() => queryClient.invalidateQueries());
		return subscribePersist(queryClient, store);
	}, []);

	// The stream reads the server URL and the name from the store when it
	// opens. A change to either closes the open stream and opens one on the
	// server the person saved.
	useEffect(() => {
		if (!url || !name) return;
		return startLive(queryClient);
	}, [url, name]);

	if (!fontLoaded) return null;

	return (
		<QueryClientProvider client={queryClient}>
			<StatusBar style={resolved === "dark" ? "light" : "dark"} />
			<Tabs
				backBehavior="history"
				screenOptions={{
					headerShown: false,
					sceneStyle: { backgroundColor: palette.bg },
					tabBarActiveTintColor: palette.accent,
					tabBarInactiveTintColor: palette.fgMuted,
					tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
					tabBarLabelStyle: { fontSize: tokens.text.xs },
				}}
			>
				<Tabs.Protected guard={configured}>
					<Tabs.Screen name="(needs-you)" options={tab("Needs you", "file-tray-outline", badge)} />
					<Tabs.Screen name="(search)" options={tab("Search", "search-outline")} />
					<Tabs.Screen name="(projects)" options={tab("Projects", "folder-outline")} />
					<Tabs.Screen name="(settings)" options={tab("Settings", "settings-outline")} />
				</Tabs.Protected>
				<Tabs.Screen
					name="setup"
					options={{
						title: "Server",
						href: null,
						headerShown: true,
						header: setupHeader,
						tabBarStyle: { display: "none" },
					}}
				/>
				<Tabs.Screen name="pair" options={{ href: null, tabBarStyle: { display: "none" } }} />
			</Tabs>
		</QueryClientProvider>
	);
}
