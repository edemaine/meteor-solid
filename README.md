# SolidJS Compiler for Meteor

This package enables full use of the [SolidJS](https://www.solidjs.com/)
[compiler](https://www.npmjs.com/package/babel-preset-solid),
including these key features:

* SSR support (via `ssr: true`)
* Server-only rendering (via `hydratable: false`)
* Applying to just a subset of files, for mixed React + SolidJS projects
  (via `match` and `ignore` options).
* JavaScript (JSX), TypeScript (TSX), and CoffeeScript (CSX) input files

## Usage

The `edemaine:solid` package replaces the standard Meteor modules
`ecmascript`, `typescript`, and `coffeescript`.
To install it, run the following commands within your Meteor project:

```bash
meteor remove ecmascript typescript coffeescript
meteor add edemaine:solid
```

Additionally, to enable CoffeeScript support, you should explicitly add
`coffeescript-compiler` (which `coffeescript` also depends on):

```bash
meteor add coffeescript-compiler
```

This package should support
all the same ECMAScript features from
[the `ecmascript` package](https://github.com/meteor/meteor/tree/devel/packages/ecmascript),
all the same TypeScript features from
[the `typescript` package](https://github.com/meteor/meteor/tree/devel/packages/typescript),
and the same CoffeeScript features from
[the `coffeescript` package](https://github.com/meteor/meteor/tree/devel/packages/non-core/coffeescript).

Upgrades to TypeScript happen in
[the `babel-compiler` package](https://github.com/meteor/meteor/tree/devel/packages/babel-compiler),
and upgrades to CoffeeScript happen in
[the `coffeescript-compiler` package](https://github.com/meteor/meteor/tree/devel/packages/non-core/coffeescript-compiler)
so you should be able to update these by depending on the latest version
within your Meteor application.

## Options

This package can be configured by adding a `solid` property to `package.json`.
Here is a complete example with all the possible options:

```json
{
  "solid": {
    "ssr": true,
    "hydratable": true,
    "match": ["**/*.tsx", "**/*.jsx"],
    "ignore": "react/**",
    "verbose": true
  }
}
```

### `ssr` (default: false)

The default setup just supports client-side `render`.
Server code doesn't use the SolidJS compiler at all.

If you want to use server-side rendering, set this to `true`.
The same file will be compiled differently on client and server
to enable server-side rendering + client-side hydration.

### `hydratable` (default: true)

If `ssr` is turned it, then the assumption is that you want to hydrate on
the client too.  If you rather want to render *only* on the server side, you
can set `hydratable` to `false`.  This will avoid running the compiler on
client code, and sets the server-code compiler to non-hydratable mode.

### `match` (default: everything)

To only apply the SolidJS compiler to certain files,
specify one or more paths or
[micromatch patterns](https://github.com/micromatch/micromatch#matching-features)
in `match`.
Paths are relative to the project root without a leading slash; for example,
`imports/ui/filename.jsx` or `lib/filename.js`.

### `ignore` (default: nothing)

To prevent applying the SolidJS compiler to certain files,
specify one or more paths or
[micromatch patterns](https://github.com/micromatch/micromatch#matching-features)
in `ignore`.
Paths are relative to the project root without a leading slash; for example,
`imports/ui/filename.jsx` or `lib/filename.js`.

If you specify both `match` and `ignore`, then `ignore` overrides `match`:
the set of compiled files consists of those matching `match` minus
those matching `ignore`.

Any files not passed through the SolidJS compiler are processed in
the standard Meteor way, which is to enable React.
If you want to use `react-fast-refresh`, you need to manually add it via
`meteor add react-fast-refresh` (whereas `ecmascript` adds it for you).

### `verbose` (default: false)

It can be hard to tell whether your configuration is applying the compiler
to the right files with the right options.  Setting `verbose` to `true`
will report messages like this:

```
react/main.tsx on client using React
client/main.tsx on client using Solid with Babel preset ["solid",{"generate":"dom","hydratable":true}]
client/main.tsx on server using Solid with Babel preset ["solid",{"generate":"ssr","hydratable":true}]
```
