const config = require(process.env.TRL1420_PROJECT_METRO_CONFIG);

config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];
config.watchFolders = [...(config.watchFolders ?? []), process.env.TRL1420_HARNESS_ROOT];
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "expo-sqlite/kv-store") {
		return { type: "sourceFile", filePath: process.env.TRL1420_SQLITE_SHIM };
	}
	if (moduleName === "expo-camera") {
		return { type: "sourceFile", filePath: process.env.TRL1420_CAMERA_SHIM };
	}
	return defaultResolve
		? defaultResolve(context, moduleName, platform)
		: context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
