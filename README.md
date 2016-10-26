# grunt-standard

> Grunt Plugin for [JavaScript Standard Style](https://github.com/feross/standard) Linting and Formatting

## Install

The following shell command will install `grunt-standard` to your project's `package.json` in `devDependencies`.

```shell
npm install grunt-standard --save-dev
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

## Contribute

In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History

_(Nothing yet)_
