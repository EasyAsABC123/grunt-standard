# grunt-standard

> Grunt plugin for [standard](https://github.com/feross/standard) linter.

## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-standard --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-standard');
```

## The "standard" task

### Overview
In your project's Gruntfile, add a section named `standard` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  standard: {
    options: {
      // Task-specific options go here.
    },
    your_target: {
      // Target-specific file lists and/or options go here.
    },
  },
});
```

### Options

#### options.format
Type: `Boolean`
Default value: `false`

Whether or not the source files should be auto-formatted using [standard-format](https://github.com/maxogden/standard-format).

#### options.lint
Type: `Boolean`
Default value: `true`

Whether ot not the source files should be linted using [standard](https://github.com/feross/standard).

### Usage Examples

#### Default Options

In this example, the default options are used to lint the specified *.js files in the root directory, lib/ directory, and tasks/ directory:

```js
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

#### Custom Options

In this example, the `format` option is set to `true` so the source files will be auto-formatted (and written back to disk) before being linted:

```js
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

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
_(Nothing yet)_
