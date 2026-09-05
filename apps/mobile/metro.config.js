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

// Workspace packages use NodeNext `.js` specifiers pointing at `.ts` sources.
// Metro does not rewrite those; map them so `@kairo/core` can bundle on EAS.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    typeof context.originModulePath === 'string' &&
    context.originModulePath.includes(`${path.sep}packages${path.sep}`)
  ) {
    try {
      return resolve(context, moduleName.replace(/\.js$/, '.ts'), platform);
    } catch {
      // fall through to the original specifier
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
