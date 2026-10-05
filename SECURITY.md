# Security policy and review

Report suspected vulnerabilities privately to the maintainer at
**jmschu02@gmail.com**. Include affected versions, reproduction steps, and
expected impact. Avoid posting exploit details in a public issue before review.

## Review of the 4.0.0 modernization

The dependency and runtime review on October 4, 2026 covered the tracked source,
package metadata, dependency tree, distribution contents, and CI configuration.
A targeted scan of tracked Git history found no common private-key or service
token patterns; this was not a comprehensive secret-scanner assessment.
It does not establish that the project is free of unknown vulnerabilities.

The baseline dependency resolution reported 20 vulnerable packages, including
two critical findings. The updated production tree reports **zero known
vulnerabilities** with `npm audit --omit=dev`. A full audit still reports six
high-severity entries arising from a single unpatched development dependency:

`grunt -> findup-sync / grunt-cli -> liftup -> findup-sync -> micromatch -> braces`

[`GHSA-vfj7-8cjw-p6xm`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects `braces` through 3.0.3. At review time, the registry and advisory provide
no patched release. Deeply nested brace patterns can exhaust the call stack.
The six entries include the affected package and its dependent packages; they
are not six independent flaws. Consumers using Grunt may also inherit this
tooling exposure even though Grunt is not a runtime dependency of this package.

Use trusted Gruntfiles and configuration. Do not pass untrusted glob patterns
to Grunt's configuration discovery. CI installs with `npm ci --ignore-scripts`,
runs jobs with read-only repository permissions and a timeout, gates production
audits, and checks the full audit against this single known advisory. New or
unrecognized development findings fail CI as well. Dependabot
checks weekly for upstream updates. These measures limit exposure; they do not
patch `braces`. Keep the full audit visible until upstream provides a fix.

The lockfile updates vulnerable transitive glob, YAML, argument parsing, and
process spawning libraries. Overrides select patched Grunt logging/utilities
that depend on Lodash 4.18 rather than vulnerable older versions. Recheck these
overrides when Grunt updates its dependency requirements.

## Runtime and packaging fixes

- Empty file selections return immediately, so an unmatched Grunt target cannot
  trigger Standard's whole-project fallback or rewrite unrelated files.
- Explicit Grunt file selections respect Standard ignore rules before linting
  or fixing. If every file is ignored, no whole-project fallback occurs.
- Unexpanded globs reach ESLint before ignore negations are applied, preventing
  silently skipped re-included files. Literal filenames containing glob
  characters continue to respect ignore rules.
- The wrapper uses Standard's asynchronous API and aggregates the returned
  ESLint results. Lint failures and rejected operations complete the Grunt task
  with failure.
- Filenames, diagnostics, rule names, and error text escape terminal control
  characters before display to prevent terminal commands and forged log lines.
- The package includes only its runtime modules, documentation, and license;
  CI files and tests are excluded. Repository links use HTTPS.
- CI action references are pinned to commit SHAs. Pull requests do not receive
  write permissions or persisted checkout credentials.

## Supported environment and trust boundary

Version 4 requires Node.js 22.13 or newer and Standard 17. Node.js and Standard
upgrades can change lint rules, so this is a major release. Standard currently
depends on ESLint 8, which upstream has deprecated; replacing Standard's engine
with an incompatible ESLint major is not a safe dependency override. Monitor
Standard for an upstream migration even when the vulnerability audit is clean.

Gruntfiles and configured parsers/plugins execute JavaScript with the user's
permissions. Run them only in trusted projects. `fix: true` intentionally writes
selected source files. This plugin does not sandbox project configuration.

## Reproducing the checks

```shell
npm ci --ignore-scripts
npm test
npm run test:unit
npm run test:integration
npm audit --omit=dev
npm audit
node scripts/audit.js
npm outdated --depth 0
npm pack --dry-run
```

The full audit currently exits nonzero for the unresolved development finding.
