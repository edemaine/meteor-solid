const solidCache = {};

function modifyBabelConfig(babelOptions, inputFile) {
  // Based on _inferFromPackageJson in
  // https://github.com/meteor/meteor/blob/devel/packages/babel-compiler/babel-compiler.js
  let pkgJsonPath, solidSettings = {};
  if (inputFile.findControlFile &&
      (pkgJsonPath = inputFile.findControlFile('package.json'))) {
    if (!Object.hasOwnProperty(solidCache, pkgJsonPath)) {
      solidCache[pkgJsonPath] = JSON.parse(
        inputFile.readAndWatchFile(pkgJsonPath)).solid || null;
    }
    solidSettings = solidCache[pkgJsonPath];
  }
  /*
  if (inputFile.hmrAvailable()) {
    babelOptions.plugins = babelOptions.plugins || [];
    babelOptions.plugins.push(...ReactFastRefresh.getBabelPluginConfig());
  }
  */
  if (!babelOptions.presets)
    babelOptions.presets = [];
  if (solidSettings.ssr) {
    console.log('SSR');
    if (babelOptions.caller.arch.startsWith('web')) // client
      babelOptions.presets.push(["solid", { generate: "dom", hydratable: true }]);
    else // server
      babelOptions.presets.push(["solid", { generate: "ssr", hydratable: true }]);
  } else {
    console.log('NOT SSR');
    if (babelOptions.caller.arch.startsWith('web')) // client
      babelOptions.presets.push(["solid"]);
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
