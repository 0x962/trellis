import { type NativeStackHeaderProps, Stack } from "expo-router";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { usePalette } from "../../src/theme/usePalette";

// The route names of the screens a person pushes on top of a tab. Only these
// screens carry a back control. The ticket header shows the identifier. The
// project screen sets its own title to the project name.
const ticketRoute = "ticket/[identifier]";
const projectRoute = "project/[ref]";

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
	const header = ({ route, navigation, options }: NativeStackHeaderProps) => {
		const pushed = route.name === ticketRoute || route.name === projectRoute;
		const title =
			route.name === ticketRoute
				? identifierOf(route.params)
				: route.name === projectRoute
					? (options.title ?? "")
					: titles[route.name]!;
		return <ScreenHeader title={title} onBack={pushed ? () => navigation.goBack() : undefined} />;
	};
	return <Stack screenOptions={{ header, contentStyle: { backgroundColor: palette.bg } }} />;
}
