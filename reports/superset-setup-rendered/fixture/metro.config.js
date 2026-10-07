const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
const boundaries = new Set([
	"expo-haptics",
	"expo-router",
	"@superset/shared/constants",
	"@/hooks/useOrgHosts",
	"@/lib/open-url",
	"@/lib/posthog",
	"@/screens/(authenticated)/hooks/useOrganizations",
	"../home/components/OrganizationHeaderButton",
]);
config.resolver.resolveRequest = (context, name, platform) => {
	if (boundaries.has(name)) return { type: "sourceFile", filePath: path.join(__dirname, "boundaries.tsx") };
	if (name.startsWith("@/")) name = path.join(__dirname, "upstream/apps/mobile", name.slice(2));
	return context.resolveRequest(context, name, platform);
};
module.exports = withUniwindConfig(config, { cssEntryFile: "./upstream/apps/mobile/global.css" });
