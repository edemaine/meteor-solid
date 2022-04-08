const solidOptionsCache = {};

function getSolidConfig(inputFile) {
  const isClient = inputFile.getArch().startsWith('web');
  const isDev = process.env.NODE_ENV !== 'production';

  let solidOptions = {};
  // Read package.json, based on _inferFromPackageJson in
  // https://github.com/meteor/meteor/blob/devel/packages/babel-compiler/babel-compiler.js
  // But use root package.json over one in node_modules, to support recompiling
  // an NPM package using the `solid` settings from the app.
  let pkgJsonPath = inputFile.findControlFile &&
    inputFile.findControlFile('package.json');
  if (pkgJsonPath) {
    const match = /\/node_modules\/[^/]*\/package.json$/.exec(pkgJsonPath);
    if (match) {
      pkgJsonPath = pkgJsonPath.slice(0, pkgJsonPath.length - match[0].length)
        + '/package.json';
      // Ensure file exists, similar to InputFile's findControlFile
      // https://github.com/meteor/meteor/blob/devel/tools/isobuild/compiler-plugin.js
      const stat = inputFile._stat(pkgJsonPath);
      if (!(stat && stat.isFile()))
        pkgJsonPath = null;
    }
  }
  if (pkgJsonPath) {
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

  // Compute Solid preset
  let solidPreset = null;
  if (useSolid) {
    if (solidOptions.ssr) {
      const hydratable = solidOptions.hydratable !== false;
      if (isClient)
        solidPreset = ["solid", {generate: "dom", hydratable}];
      else // server
        solidPreset = ["solid", {generate: "ssr", hydratable}];
    } else {
      if (isClient)
        solidPreset = ["solid"];
    }
  }

  return {solidOptions, isClient, isDev, useSolid, solidPreset};
}

function modifyBabelConfig(babelOptions, inputFile) {
  const {solidOptions, isClient, isDev, useSolid, solidPreset} =
    getSolidConfig(inputFile);

  // Modify babelOptions in-place.
  if (!babelOptions.presets) babelOptions.presets = [];
  if (useSolid && isDev) {
    // Install solid-js renaming plugin, as preset to run after Solid preset.
    // (Note Babel presets are run in reverse order, last to first.)
    const extension = isClient ? '.cjs' : '.js';
    babelOptions.presets.push({
      plugins: [[
        Npm.require('babel-plugin-rewrite-require'),
        {
          aliases: {
            'solid-js/store': 'solid-js/store/dist/dev' + extension,
            'solid-js/web': 'solid-js/web/dist/dev' + extension,
            'solid-js': 'solid-js/dist/dev' + extension,
          }
        }
      ]]
    });
  }
  if (solidPreset) {
    babelOptions.presets.push(solidPreset);
  } else {
    // Fall back to React mode, Meteor's default.
    // Modify Meteor's options which are in a bundle as the first preset.
    const options = babelOptions.presets[0];
    // Copied from maybeAddReactPlugins from
    // https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-babel/options.js
    // but replacing `require` with `Npm.require` for use in Meteor package.
    options.presets.push(Npm.require("@babel/preset-react"));
    options.plugins.push(
      [Npm.require("@babel/plugin-proposal-class-properties"), {
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
      `on ${isClient ? 'client' : 'server'}`,
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

if (Package['coffeescript-compiler']) {
  class SolidCoffeeScriptCompiler extends Package['coffeescript-compiler'].CoffeeScriptCompiler {
    constructor() {
      super();
      // Override super's babelCompiler to use our Solid compiler:
      this.babelCompiler = new BabelCompiler({
        react: false,
      }, modifyBabelConfig);
    }
  }

  // The following code is copied from
  // https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript/compile-coffeescript.js
  // copyright Meteor Software Ltd., licensed under MIT License
  // Modified to use SolidCoffeeScriptCompiler over CoffeeScriptCompiler

  // The CompileResult for this CachingCompiler is a {source, sourceMap} object.
  class CachedCoffeeScriptCompiler extends CachingCompiler {
    constructor() {
      super({
        compilerName: 'solid-coffeescript',
        defaultCacheSize: 1024*1024*10,
      });

      this.coffeeScriptCompiler = new SolidCoffeeScriptCompiler();
    }

    getCacheKey(inputFile) {
      const {isDev, useSolid, solidPreset} = getSolidConfig(inputFile);
      return [
        inputFile.getArch(),
        inputFile.getSourceHash(),
        inputFile.getDeclaredExports(),
        this.coffeeScriptCompiler.getCompileOptions(inputFile),
        useSolid,
        solidPreset,
        isDev,
      ];
    }

    setDiskCacheDirectory(cacheDir) {
      this.coffeeScriptCompiler.babelCompiler.setDiskCacheDirectory(cacheDir);
      return super.setDiskCacheDirectory(cacheDir);
    }

    compileOneFileLater(inputFile, getResult) {
      inputFile.addJavaScript({
        path: this.coffeeScriptCompiler.outputFilePath(inputFile),
        sourcePath: inputFile.getPathInPackage(),
        bare: inputFile.getFileOptions().bare
      }, async () => {
        const result = await getResult();
        return result && {
          data: result.source,
          sourceMap: result.sourceMap,
        };
      });
    }

    compileOneFile(inputFile) {
      return this.coffeeScriptCompiler.compileOneFile(inputFile);
    }

    addCompileResult(inputFile, sourceWithMap) {
      inputFile.addJavaScript({
        path: this.coffeeScriptCompiler.outputFilePath(inputFile),
        sourcePath: inputFile.getPathInPackage(),
        data: sourceWithMap.source,
        sourceMap: sourceWithMap.sourceMap,
        bare: inputFile.getFileOptions().bare
      });
    }

    compileResultSize(sourceWithMap) {
      return sourceWithMap.source.length +
        this.sourceMapSize(sourceWithMap.sourceMap);
    }
  }

  Plugin.registerCompiler({
    extensions: ['coffee', 'litcoffee', 'coffee.md']
  }, () => new CachedCoffeeScriptCompiler());
}
