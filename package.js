const versions = {
  2: '0.4.0',
  3: '1.4.0',
};

const meteorVersion = process.env.METEOR_VERSION || '3';
const version = versions[meteorVersion];

if (!version) {
  throw new Error(`Unknown METEOR_VERSION="${meteorVersion}". Use 2 or 3.`);
}

Package.describe({
  name: 'edemaine:solid',
  version,
  summary: 'Compiler plugin for SolidJS including SSR',
  documentation: 'README.md',
  git: 'https://github.com/edemaine/meteor-solid.git',
});

Package.registerBuildPlugin({
  name: 'compile-solid',
  use: [
    'babel-compiler@7.6.2||7.11.0',
    'caching-compiler@1.2.1||2.0.1',
    'coffeescript-compiler@2.4.1',
  ],
  sources: ['plugin.js'],
  npmDependencies: {
    micromatch: '4.0.4',
    // implied by https://github.com/meteor/meteor/blob/devel/npm-packages/meteor-babel/package.json
    //"@babel/plugin-proposal-class-properties": "7.16.7",
    //"@babel/preset-react": "7.16.7",
  },
});

Package.onUse(function(api) {
  api.versionsFrom(['2.3', '3.0']);
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('babel-compiler@7.6.2||7.11.0');
  api.use('coffeescript-compiler@2.4.1', {weak: true});
  api.use('react-fast-refresh', {weak: true});

  // The following api.imply calls should match those in
  // https://github.com/meteor/meteor/blob/devel/packages/ecmascript/package.js
  api.imply('modules');
  api.imply('ecmascript-runtime');
  api.imply('babel-runtime');
  api.imply('promise');

  // Runtime support for Meteor 1.5 dynamic import(...) syntax.
  api.imply('dynamic-import');
});
