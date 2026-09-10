import { Ionicons } from "@expo/vector-icons";
import { QueryClientProvider } from "@tanstack/react-query";
import { Tabs } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useMMKVString } from "react-native-mmkv";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { startLive } from "../src/lib/live";
import { queryClient } from "../src/lib/queryClient";
import { restoreClient, subscribePersist } from "../src/lib/storage";
import { keys, store } from "../src/lib/store";
import { tokens } from "../src/theme/tokens";
import { usePalette } from "../src/theme/usePalette";
import { useTheme } from "../src/theme/useTheme";

type IconName = keyof typeof Ionicons.glyphMap;

// The routes a person reaches by a push. Their header carries a back control.
const pushed = new Set(["ticket/[identifier]", "setup"]);

const identifierOf = (params: object | undefined) => (params as { identifier?: string } | undefined)?.identifier ?? "";

// The whole app is one tab navigator. The four tabs and the ticket route are
// behind the guard: without a stored server URL and name, only the setup
// screen exists, so the app shows setup until both are saved. The ticket and
// setup routes are tab screens without a tab bar item.
export default function RootLayout() {
	const [url] = useMMKVString(keys.serverUrl, store);
	const [name] = useMMKVString(keys.actorName, store);
	const configured = Boolean(url) && Boolean(name);
	const { resolved } = useTheme();
	const palette = usePalette();

	// A tab's options. The accessibility label is the title itself, so a
	// screen reader and a test both find the tab by its name.
	const tab = (title: string, name: IconName) => ({
		title,
		tabBarAccessibilityLabel: title,
		tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) => (
			<Ionicons name={name} size={size} color={focused ? palette.accent : palette.fgMuted} />
		),
	});

	useEffect(() => {
		void restoreClient(queryClient, store);
		return subscribePersist(queryClient, store);
	}, []);

	useEffect(() => (configured ? startLive(queryClient) : undefined), [configured]);

	return (
		<QueryClientProvider client={queryClient}>
			<StatusBar style={resolved === "dark" ? "light" : "dark"} />
			<Tabs
				backBehavior="history"
				screenOptions={{
					header: ({ route, options, navigation }) => (
						<ScreenHeader
							title={options.title ?? route.name}
							onBack={pushed.has(route.name) && navigation.canGoBack() ? () => navigation.goBack() : undefined}
						/>
					),
					sceneStyle: { backgroundColor: palette.bg },
					tabBarActiveTintColor: palette.accent,
					tabBarInactiveTintColor: palette.fgMuted,
					tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
					tabBarLabelStyle: { fontSize: tokens.text.xs },
				}}
			>
				<Tabs.Protected guard={configured}>
					<Tabs.Screen name="(tabs)/index" options={tab("Needs you", "file-tray-outline")} />
					<Tabs.Screen name="(tabs)/search" options={tab("Search", "search-outline")} />
					<Tabs.Screen name="(tabs)/projects" options={tab("Projects", "folder-outline")} />
					<Tabs.Screen name="(tabs)/settings" options={tab("Settings", "settings-outline")} />
					<Tabs.Screen
						name="ticket/[identifier]"
						options={({ route }) => ({
							title: identifierOf(route.params),
							tabBarButton: () => null,
							tabBarItemStyle: { display: "none" },
						})}
					/>
				</Tabs.Protected>
				<Tabs.Screen name="setup" options={{ title: "Server", href: null, tabBarStyle: { display: "none" } }} />
			</Tabs>
		</QueryClientProvider>
	);
}
