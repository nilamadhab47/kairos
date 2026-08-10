// Metro config for Expo + NativeWind v4 inside a pnpm/Turbo monorepo.
// - Watches monorepo root so workspace packages (@kairo/core) hot-reload.
// - Resolves shared deps via the project node_modules first.
// - Package exports required for better-auth/react + @better-auth/expo/client.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: './global.css' });
