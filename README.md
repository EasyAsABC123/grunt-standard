# grunt-standard  [![Travis](https://travis-ci.org/EasyAsABC123/grunt-standard.svg?branch=master)](https://travis-ci.org/EasyAsABC123/grunt-standard) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/) [![npm (scoped)](https://img.shields.io/npm/v/grunt-standard.svg)](https://www.npmjs.com/package/grunt-standard) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/EasyAsABC123/grunt-standard/blob/master/LICENSE) [![GitHub issues](https://img.shields.io/github/issues/EasyAsABC123/grunt-standard.svg)](https://github.com/EasyAsABC123/grunt-standard/issues) [![GitHub followers](https://img.shields.io/github/followers/EasyAsABC123.svg?style=social&label=Follow)](https://github.com/EasyAsABC123)

> Grunt Plugin for [JavaScript Standard Style](https://github.com/feross/standard) Linting and Formatting

> Dependencies up-to-date!

## Install

The following shell commands will install `grunt-standard` to your project's `package.json` in `devDependencies`.

### npm
```shell
npm install grunt-standard --save-dev
```

### Yarn
```shell
yarn add grunt-standard --dev
```

### Assumptions

- You have the latest version of `grunt` in your project's `package.json`'s `devDependencies`.
- You have added the npm task to your project's `Gruntfile.js`.
- You are running `node >= 4`.

```javascript
grunt.loadNpmTasks('grunt-standard')
```

### Notes

- If you are running `node < 4` use [`2.15.0`](https://github.com/EasyAsABC123/grunt-standard/tree/node-0.10-support)

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

#### options.ignore

- **Type:** `Array`
- **Default:** `[]`
- **Action:** Lint source files using [JavaScript Standard Style](https://github.com/feross/standard#standardlintfilesfiles-opts-callback).

#### options.cwd

- **Type:** `String`
- **Default:** `''`
- **Action:** current working directory (default: process.cwd()) [Documentation](https://github.com/feross/standard#standardlintfilesfiles-opts-callback).

#### options.fix

- **Type:** `Boolean`
- **Default:** `false`
- **Action:** Auto-format source files using [standard --fix](https://github.com/feross/standard#is-there-an-automatic-formatter).

#### options.globals

- **Type:** `Array`
- **Default:** `[]`
- **Action:** global variables to declare [Documentation](https://github.com/feross/standard#standardlintfilesfiles-opts-callback).

#### options.plugins

- **Type:** `Array`
- **Default:** `[]`
- **Action:** eslint plugins [Documentation](https://github.com/feross/standard#standardlintfilesfiles-opts-callback).

#### options.envs

- **Type:** `Array`
- **Default:** `[]`
- **Action:** eslint environment [Valid Values](https://github.com/sindresorhus/globals/blob/master/globals.json).

#### options.parser

- **Type:** `Array`
- **Default:** `''`
- **Action:** js parser (e.g. babel-eslint) [Documentation](https://github.com/feross/standard#standardlintfilesfiles-opts-callback).

In this example, the `fix` option is set to `true` so the source files will be auto-formatted (and written back to disk) before being linted:

```javascript
grunt.initConfig({
  standard: {
    options: {
      fix: true
    },
    app: {
      src: [
        '{,lib/,tasks/}*.js'
      ]
    }
  }
})
```

## [Contribute](CONTRIBUTE.md)
