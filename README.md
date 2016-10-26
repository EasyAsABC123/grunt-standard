# grunt-standard [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/) [![GitHub release](https://img.shields.io/github/release/4cm4k1/grunt-standard.svg)](https://github.com/4cm4k1/grunt-standard/releases) [![npm (scoped)](https://img.shields.io/npm/v/@4cm4k1/grunt-standard.svg)](https://www.npmjs.com/package/@4cm4k1/grunt-standard) [![license](https://img.shields.io/github/license/4cm4k1/grunt-standard.svg)](https://github.com/4cm4k1/grunt-standard/blob/master/LICENSE) [![Twitter Follow](https://img.shields.io/twitter/follow/4cm4k1.svg?style=social&label=Follow)](https://twitter.com/4cm4k1) [![GitHub followers](https://img.shields.io/github/followers/4cm4k1.svg?style=social&label=Follow)](https://github.com/4cm4k1)

> Grunt Plugin for [JavaScript Standard Style](https://github.com/feross/standard) Linting and Formatting

> Based on [@pdehaan/grunt-standard](https://github.com/pdehaan/grunt-standard)

> Dependencies up-to-date!

## Install

The following shell commands will install `grunt-standard` to your project's `package.json` in `devDependencies`.

### npm
```shell
npm install @4cm4k1/grunt-standard --save-dev
```

### Yarn
```shell
yarn add @4cm4k1/grunt-standard --dev
```

### Assumptions

- You have the latest version of `grunt` in your project's `package.json`'s `devDependencies`.
- You have added the npm task to your project's `Gruntfile.js`.
- You are running the latest version of `node`.

```javascript
grunt.loadNpmTasks('grunt-standard')
```

## Configure

In your project's `Gruntfile.js`, add a section named `standard` to the data object passed into `grunt.initConfig()`.

### Default

In this example, the default options are used to lint the specified `*.js` files in the root, `lib/`, and `tasks/` directories:

```javascript
grunt.initConfig({
  standard: {
    app: {
      src: [
        '{,lib/,tasks/}*.js'
      ]
    }
  }
})
```

### Custom

#### options.format

- **Type:** `Boolean`
- **Default:** `false`
- **Action:** Auto-format source files using [standard-format](https://github.com/maxogden/standard-format).

#### options.lint

- **Type:** `Boolean`
- **Default:** `true`
- **Action:** Lint source files using [JavaScript Standard Style](https://github.com/feross/standard).

In this example, the `format` option is set to `true` so the source files will be auto-formatted (and written back to disk) before being linted:

```javascript
grunt.initConfig({
  standard: {
    options: {
      format: true
    },
    app: {
      src: [
        '{,lib/,tasks/}*.js'
      ]
    }
  }
})
```

## [Contribute](https://github.com/4cm4k1/grunt-standard/blob/master/CONTRIBUTE.md)
