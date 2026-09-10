const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

// expo-router turns every .tsx file under app/ into a route, and a file
// named `_layout.test.tsx` even counts as a layout. The route tests sit
// beside the routes they test, so the file crawler never sees them.
const appDir = path.join(__dirname, "app").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [...config.resolver.blockList, new RegExp(`^${appDir}/.*\\.test\\.[jt]sx?$`)];

// React Native 0.87 keeps its polyfill list in @react-native/js-polyfills. Expo 57
// asks react-native/rn-get-polyfills for it, a file only React Native 0.86 ships.
config.serializer.getPolyfills = require("@react-native/js-polyfills");

module.exports = withNativeWind(config, { input: "./global.css" });
