const solidOptionsCache = {};
function modifyBabelConfig(babelOptions, inputFile) {
  const client = babelOptions.caller.arch.startsWith('web');

  // Based on _inferFromPackageJson in
  // https://github.com/meteor/meteor/blob/devel/packages/babel-compiler/babel-compiler.js
  let pkgJsonPath, solidOptions = {};
  if (inputFile.findControlFile &&
      (pkgJsonPath = inputFile.findControlFile('package.json'))) {
    if (!Object.hasOwnProperty(solidOptionsCache, pkgJsonPath)) {
      solidOptionsCache[pkgJsonPath] = JSON.parse(
        inputFile.readAndWatchFile(pkgJsonPath)).solid || {};
    }
    solidOptions = solidOptionsCache[pkgJsonPath];
  }

  // Default behavior is to turn on Solid mode always.
  // Two options can override this:
  // * 'match' specifies one or more micromatch patterns for filenames that
  //   should have Solid compilation; anything else will no longer by default.
  // * 'ignore' specifies one or more micromatch patterns for filenames that
  //   should not have Solid compilation, overriding 'match' if both specified.
  let useSolid = true;
  if (solidOptions.match)
    useSolid = Npm.require('micromatch').isMatch(
      inputFile.getPathInPackage(), solidOptions.match);
  if (solidOptions.ignore)
    useSolid = useSolid && !Npm.require('micromatch').isMatch(
      inputFile.getPathInPackage(), solidOptions.ignore);

  // Modify babelOptions in-place.
  let solidPreset = null;
  if (useSolid) {
    if (!babelOptions.presets)
      babelOptions.presets = [];
    if (solidOptions.ssr) {
      const hydratable = solidOptions.hydratable !== false;
      if (client)
        babelOptions.presets.push(solidPreset =
          ["solid", {generate: "dom", hydratable}]);
      else // server
        babelOptions.presets.push(solidPreset =
          ["solid", {generate: "ssr", hydratable}]);
    } else {
      if (client)
        babelOptions.presets.push(solidPreset = ["solid"]);
    }
  } else {
    // Fall back to React mode, Meteor's default.
    // Modify Meteor's options which are in a bundle as the first preset.
    const options = babelOptions.presets[0];
    // Copied from maybeAddReactPlugins from
    // https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-babel/options.js
    // but without require()s, as Npm.require() would force us to add depends.
    options.presets.push("@babel/preset-react");
    options.plugins.push(
      ["@babel/plugin-proposal-class-properties", {
        loose: true
      }]
    );
    // HMR enabling based on
    // https://github.com/meteor/meteor/blob/devel/packages/ecmascript/plugin.js
    if (inputFile.hmrAvailable() && Package.ReactFastRefresh) {
      babelOptions.plugins = babelOptions.plugins || [];
      babelOptions.plugins.push(...Package.ReactFastRefresh.getBabelPluginConfig());
    }
  }

  if (solidOptions.verbose) {
    console.log(inputFile.getPathInPackage() +
      (inputFile.getPackageName() ?
        ` in package ${inputFile.getPackageName()}` : ''),
      `on ${client ? 'client' : 'server'}`,
      `using ${useSolid ? 'Solid' : 'React'}` +
      (useSolid ? ` with Babel preset ${JSON.stringify(solidPreset)}` : ''));
  }
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
