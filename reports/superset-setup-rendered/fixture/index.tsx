import "./upstream/apps/mobile/global.css";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { registerRootComponent } from "expo";
import { Uniwind } from "uniwind";
import { HomeConnectHostScreen } from "./upstream/apps/mobile/screens/(authenticated)/(home)/home-connect-host/HomeConnectHostScreen";
import { messages } from "./upstream/packages/i18n/locales/en/messages.js";

i18n.loadAndActivate({ locale: "en", messages });
Uniwind.setTheme(new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark");
function Fixture() {
	return (
		<I18nProvider i18n={i18n}>
			<HomeConnectHostScreen />
		</I18nProvider>
	);
}
registerRootComponent(Fixture);
