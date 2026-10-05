# grunt-standard  [![CI](https://github.com/EasyAsABC123/grunt-standard/actions/workflows/ci.yml/badge.svg)](https://github.com/EasyAsABC123/grunt-standard/actions/workflows/ci.yml) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](https://standardjs.com/) [![npm](https://img.shields.io/npm/v/grunt-standard.svg)](https://www.npmjs.com/package/grunt-standard) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Grunt Plugin for [JavaScript Standard Style](https://github.com/standard/standard) Linting and Formatting

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

- You are running Node.js 22.13 or newer.
- You have Grunt 1.6 or newer installed in your project's `devDependencies`.
- You load the task in your project's `Gruntfile.js`:

```javascript
grunt.loadNpmTasks('grunt-standard')
```

### Notes

This release raises the Node.js requirement from Node.js 4 to Node.js 22.13 and upgrades JavaScript Standard Style from version 12 to version 17. These are breaking changes: update your Node.js runtime and review the [Standard changelog](https://github.com/standard/standard/blob/master/CHANGELOG.md) for lint rules that can affect your project.

The Grunt `standard` task and its configuration options remain available. Custom ESLint parsers and plugins must be compatible with Standard 17 and its ESLint 8 dependency.

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
- **Action:** Ignore matching file globs when linting source files using [JavaScript Standard Style](https://github.com/standard/standard#async-standardlintfilesfiles-opts).

#### options.cwd

- **Type:** `String`
- **Default:** `process.cwd()`
- **Action:** current working directory (default: process.cwd()); relative paths resolve from the process working directory. [Documentation](https://github.com/standard/standard#async-standardlintfilesfiles-opts).

#### options.fix

- **Type:** `Boolean`
- **Default:** `false`
- **Action:** Auto-format source files using [standard --fix](https://github.com/standard/standard#is-there-an-automatic-formatter).

#### options.globals

- **Type:** `Array`
- **Default:** `[]`
- **Action:** global variables to declare [Documentation](https://github.com/standard/standard#async-standardlintfilesfiles-opts).

#### options.plugins

- **Type:** `Array`
- **Default:** `[]`
- **Action:** Custom ESLint plugins [Documentation](https://github.com/standard/standard#async-standardlintfilesfiles-opts).

#### options.envs

- **Type:** `Array`
- **Default:** `[]`
- **Action:** ESLint environments [Valid Values](https://github.com/eslint/eslint/blob/v8.57.1/conf/environments.js).

#### options.parser

- **Type:** `String`
- **Default:** `''`
- **Action:** JavaScript parser module name (e.g. `@babel/eslint-parser`) [Documentation](https://github.com/standard/standard#async-standardlintfilesfiles-opts).

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

Files excluded by Standard ignore rules are skipped, including explicit Grunt file selections. Targets with no remaining files succeed without linting or formatting the rest of the project.

## Security

See [the security review and reporting policy](SECURITY.md) for dependency findings and current limitations.

Run Grunt only in projects you trust. Gruntfiles and configured ESLint parsers or plugins execute JavaScript with your account's permissions. The `fix` option writes changes to the selected source files.

## [Contribute](CONTRIBUTE.md)

## License and credits

[MIT](LICENSE). This project is maintained by Justin Schuhmann and was forked from [Peter deHaan's grunt-standard](https://github.com/pdehaan/grunt-standard).
