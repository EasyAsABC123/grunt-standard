This historical consumer fixture freezes Grunt 1.6.3, published grunt-standard
3.2.0, and their complete transitive dependency tree. The integration test copies
the archived manifest and lockfile to conventional npm filenames in temporary
projects, runs `npm ci --ignore-scripts`, and verifies installed versions.

The historical dependencies intentionally preserve known old vulnerabilities for
compatibility comparison. They execute only trusted test source. Installation
scripts are disabled and this historical baseline is not a release audit target.
The candidate is installed from the actual `npm pack` tarball, with the same
pinned Grunt tooling, into a separate temporary consumer project.

Run with `npm run test:integration`. Installation errors fail the suite; there is
no network-error skip or fallback to repository dependencies. Each test case has
its own source directory underneath its release's isolated installation.
