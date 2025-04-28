# Change Log

All notable changes to the "nsql" extension will be documented in this file.

## [0.2.0] - 2025-04-28

### Added

- Added `NSQL` language server with basic hover and completion support.
- Added `NSQL` document validation.

### Changed

- Updated package.json to include necessary dependencies for the language server.
- Updated .vscodeignore to exclude node_modules.

## [0.1.0] - 2025-04-24

### Added

- .node-version file (specifies the desired node version for people using things like nvm or fnm)
- LICENSE file
- @vscode/vsce dev dependency
- node_modules to the .gitignore

### Changed

- This version was previously released as 0.0.1, however, I have changed the versioning scheme to follow [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH) to better reflect the changes made in each release.
- The version number in package.json was changed from 0.0.1 to 0.1.0 to reflect the new versioning scheme.

## [Unreleased]

- Initial release
