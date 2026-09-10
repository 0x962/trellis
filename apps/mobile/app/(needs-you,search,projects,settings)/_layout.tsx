import { type NativeStackHeaderProps, Stack } from "expo-router";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { usePalette } from "../../src/theme/usePalette";

// The route name of the ticket screen. It is the one screen a person pushes
// on top of a tab, so it is the one screen with a back control.
const ticketRoute = "ticket/[identifier]";

// The title of the first screen of each tab, by route name.
const titles: Record<string, string> = {
	index: "Needs you",
	search: "Search",
	projects: "Projects",
	settings: "Settings",
};

const identifierOf = (params: object | undefined) => (params as { identifier?: string } | undefined)?.identifier ?? "";

// One stack per tab. The file name lists the four tab groups, so expo-router
// gives each group its own copy of this stack and of the ticket screen under
// it. A ticket opened in a tab stays in that tab: the tab bar stays visible,
// a second ticket pushes on top of the first, and back returns to the ticket
// below.
export default function TabStackLayout() {
	const palette = usePalette();
	const header = ({ route, navigation }: NativeStackHeaderProps) => {
		const pushed = route.name === ticketRoute;
		return (
			<ScreenHeader
				title={pushed ? identifierOf(route.params) : titles[route.name]!}
				onBack={pushed ? () => navigation.goBack() : undefined}
			/>
		);
	};
	return <Stack screenOptions={{ header, contentStyle: { backgroundColor: palette.bg } }} />;
}
