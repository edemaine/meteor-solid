// Meteor puts a big preset bundle in position 0
function meteorPreset(x) {
  return (x && x.presets && x.presets[0]) || {};
}

// Extract React options from Babel by diffing react: true vs. false
// (because maybeAddReactPlugins isn't exported by
// https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-babel/options.js)
let reactOptionsCache;
function reactOptions() {
  if (!reactOptionsCache) {
    // Start with all React options
    reactOptionsCache = meteorPreset(Babel.getDefaultOptions({react: true}));
    // Drop non-Array options, as we don't know how to diff those.
    Object.entries(reactOptionsCache).forEach(([key, value]) => {
      if (!Array.isArray(value))
        delete reactOptionsCache[key];
    });
    // Remove non-React options via diff
    Object.entries(meteorPreset(Babel.getDefaultOptions({react: false})))
    .forEach(([key, baseValue]) => {
      if (Array.isArray(baseValue)) {
        const baseParts = {};
        baseValue.forEach(basePart => baseParts[JSON.stringify(basePart)] = true);
        reactOptionsCache[key] = reactOptionsCache[key]
        .filter(reactPart =>
          !baseParts.hasOwnProperty(JSON.stringify(reactPart)));
        if (!reactOptionsCache[key].length)
          delete reactOptionsCache[key];
      }
    });
  }
  console.log(JSON.stringify(reactOptionsCache));
  return reactOptionsCache;
}

const solidSettingsCache = {};
function modifyBabelConfig(babelOptions, inputFile) {
  console.log('---');
  console.log(inputFile.getPathInPackage(), 'before', babelOptions.presets, babelOptions.plugins);
  console.log('---');

  // Based on _inferFromPackageJson in
  // https://github.com/meteor/meteor/blob/devel/packages/babel-compiler/babel-compiler.js
  let pkgJsonPath, solidSettings = {};
  if (inputFile.findControlFile &&
      (pkgJsonPath = inputFile.findControlFile('package.json'))) {
    if (!Object.hasOwnProperty(solidSettingsCache, pkgJsonPath)) {
      solidSettingsCache[pkgJsonPath] = JSON.parse(
        inputFile.readAndWatchFile(pkgJsonPath)).solid || {};
    }
    solidSettings = solidSettingsCache[pkgJsonPath];
  }

  // Default behavior is to turn on Solid mode always.
  // Two options can override this:
  // * 'match' specifies one or more micromatch patterns for filenames that
  //   should have Solid compilation; anything else will no longer by default.
  // * 'ignore' specifies one or more micromatch patterns for filenames that
  //   should not have Solid compilation, overriding 'match' if both specified.
  let useSolid = true;
  if (solidSettings.match)
    useSolid = Npm.require('micromatch').isMatch(
      inputFile.getPathInPackage(), solidSettings.match);
  if (solidSettings.ignore)
    useSolid = useSolid && !Npm.require('micromatch').isMatch(
      inputFile.getPathInPackage(), solidSettings.ignore);

  // Modify babelOptions in-place.
  if (useSolid) {
    if (!babelOptions.presets)
      babelOptions.presets = [];
    if (solidSettings.ssr) {
      const hydratable = solidSettings.hydratable !== false;
      if (babelOptions.caller.arch.startsWith('web')) // client
        babelOptions.presets.push(["solid", {generate: "dom", hydratable}]);
      else // server
        babelOptions.presets.push(["solid", {generate: "ssr", hydratable}]);
    } else {
      if (babelOptions.caller.arch.startsWith('web')) // client
        babelOptions.presets.push(["solid"]);
    }
  } else {
    // Fall back to React mode, Meteor's default.
    const preset = meteorPreset(babelOptions);
    Object.entries(reactOptions()).forEach((key, value) => {
      if (!preset[key])
        preset[key] = [];
      preset[key].push(...value);
    });
    // HMR enabling based on
    // https://github.com/meteor/meteor/blob/devel/packages/ecmascript/plugin.js
    if (inputFile.hmrAvailable() && Package.ReactFastRefresh) {
      babelOptions.plugins = babelOptions.plugins || [];
      babelOptions.plugins.push(...Package.ReactFastRefresh.getBabelPluginConfig());
    }
  }
  console.log('---');
  console.log(inputFile.getPathInPackage(), useSolid, babelOptions.presets, babelOptions.plugins);
  console.log('---');
}

Plugin.registerCompiler({
  extensions: ['js', 'jsx', 'mjs'],
}, function () {
  return new BabelCompiler({
    react: false,
  }, modifyBabelConfig);
});

Plugin.registerCompiler({
  extensions: ["ts", "tsx"],
}, function () {
  return new TypeScriptCompiler({
    react: false,
    typescript: true,
  }, modifyBabelConfig);
});

// Copied from Meteor's typescript package:
// https://github.com/meteor/meteor/blob/devel/packages/typescript/plugin.js
class TypeScriptCompiler extends BabelCompiler {
  processFilesForTarget(inputFiles) {
    return super.processFilesForTarget(inputFiles.filter(
      // TypeScript .d.ts declaration files look like .ts files, but it's
      // important that we do not compile them using the TypeScript
      // compiler, as it will fail with a cryptic error message.
      file => ! file.getPathInPackage().endsWith(".d.ts")
    ));
  }
}
