# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0]
### Uncategorized
- Bump @metamask/auto-changelog from 2.5.0 to 2.6.1 ([#109](https://github.com/MetaMask/eth-block-tracker/pull/109))
- Add `destroy` method to block tracker classes ([#106](https://github.com/MetaMask/eth-block-tracker/pull/106))
- Rewrite tests using Jest ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))
- Remove sometimes-unsupported newHeads parameter ([#108](https://github.com/MetaMask/eth-block-tracker/pull/108))
- Standardize repo (minus tests) ([#97](https://github.com/MetaMask/eth-block-tracker/pull/97))
- Update dev dependencies ([#96](https://github.com/MetaMask/eth-block-tracker/pull/96))
- Bump simple-get from 2.8.1 to 2.8.2 ([#99](https://github.com/MetaMask/eth-block-tracker/pull/99))
- Bump ajv from 6.10.2 to 6.12.6 ([#100](https://github.com/MetaMask/eth-block-tracker/pull/100))
- Bump copy-props from 2.0.4 to 2.0.5 ([#98](https://github.com/MetaMask/eth-block-tracker/pull/98))
- Bump minimist from 1.2.5 to 1.2.6 ([#95](https://github.com/MetaMask/eth-block-tracker/pull/95))
- Bump tar from 4.4.17 to 4.4.19 ([#87](https://github.com/MetaMask/eth-block-tracker/pull/87))
- Migrate from CircleCI to GitHub Actions ([#88](https://github.com/MetaMask/eth-block-tracker/pull/88))
- Bump tar from 4.4.8 to 4.4.17 ([#86](https://github.com/MetaMask/eth-block-tracker/pull/86))
- Bump path-parse from 1.0.6 to 1.0.7 ([#85](https://github.com/MetaMask/eth-block-tracker/pull/85))
- Bump normalize-url from 4.3.0 to 4.5.1 ([#83](https://github.com/MetaMask/eth-block-tracker/pull/83))
- Bump hosted-git-info from 2.8.4 to 2.8.9 ([#81](https://github.com/MetaMask/eth-block-tracker/pull/81))
- Bump lodash from 4.17.19 to 4.17.21 ([#80](https://github.com/MetaMask/eth-block-tracker/pull/80))
- Repo standardization ([#79](https://github.com/MetaMask/eth-block-tracker/pull/79))
- Bump y18n from 3.2.1 to 3.2.2 ([#78](https://github.com/MetaMask/eth-block-tracker/pull/78))

## [5.0.1] - 2021-03-25
### Fixed
- Add missing `types` field to `package.json` ([#75](https://github.com/MetaMask/eth-block-tracker/pull/75))

## [5.0.0] - 2021-03-25
### Changed
- **(BREAKING)** Refactor exports ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- **(BREAKING)** Target ES2017, remove ES5 builds ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- Migrate to TypeScript ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- Update various dependencies ([#44](https://github.com/MetaMask/eth-block-tracker/pull/44), [#49](https://github.com/MetaMask/eth-block-tracker/pull/49), [#54](https://github.com/MetaMask/eth-block-tracker/pull/54), [#59](https://github.com/MetaMask/eth-block-tracker/pull/59), [#61](https://github.com/MetaMask/eth-block-tracker/pull/61), [#62](https://github.com/MetaMask/eth-block-tracker/pull/62), [#63](https://github.com/MetaMask/eth-block-tracker/pull/63), [#70](https://github.com/MetaMask/eth-block-tracker/pull/70), [#72](https://github.com/MetaMask/eth-block-tracker/pull/72))

### Removed
- Remove unused production dependencies ([#60](https://github.com/MetaMask/eth-block-tracker/pull/60), [#68](https://github.com/MetaMask/eth-block-tracker/pull/68))

## [4.4.3] - 2019-08-30
### Added
- Add SubscribeBlockTracker

### Changed
- Change events so that they now only return the block number (internal polling is done via `eth_blockNumber`)
- Add `retryTimeout` and `keepEventLoopActive` to constructor
- Update block trackers to inherit from `safe-event-emitter` rather than EventEmitter

### Removed
- Remove `block` event
  - Please use `latest` or `sync`.

## [4.0.0] - 2018-04-26
### Added
- Add isRunning method
- Add `error` event

### Changed
- Significantly rewrite `eth-block-tracker` (primarily due to optimizing network IO)
- Rename `awaitCurrentBlock` to `getLatestBlock`

### Removed
- Remove `stop`/`start` methods from BlockTrackers
  - BlockTrackers now automatically start and stop based on listener count for the `latest` and `sync` events. You can force a stop by calling the `EventEmitter` method `removeAllListeners`.
- Remove tx body from block
- Remove getTrackingBlock
- Remove start/stop
- Remove test/util/testBlockMiddleware

## [3.0.0] - 2018-04-16
### Changed
- Update published version so main module now exports unprocessed source
- Module includes dist:
  - Bundle: `dist/EthBlockTracker.js`
  - ES5 source: `dist/es5/`
- Rename `lib` to `src`
- Update RpcBlockTracker to be a normal `EventEmitter`
  - It no longer provides a callback to event handlers.

### Fixed
- Fix `awaitCurrentBlock` return value

## [2.0.0] - 2017-06-14
### Added
- Expose EventEmitter interface (via `async-eventemitter`)
- Add `getTrackingBlock`, `getCurrentBlock`, `start`, and `stop`
- Add events: `block`, `latest`, `sync`

## [1.0.0] - 2017-02-03
### Added
- Add RpcBlockTracker

[Unreleased]: https://github.com/MetaMask/eth-block-tracker/compare/v6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v5.0.1...v6.0.0
[5.0.1]: https://github.com/MetaMask/eth-block-tracker/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v4.4.3...v5.0.0
[4.4.3]: https://github.com/MetaMask/eth-block-tracker/compare/v4.0.0...v4.4.3
[4.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/MetaMask/eth-block-tracker/releases/tag/v1.0.0
