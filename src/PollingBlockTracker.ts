import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcRequest } from 'json-rpc-engine';
import getCreateRandomId from 'json-rpc-random-id';
import pify from 'pify';

import { BaseBlockTracker } from './BaseBlockTracker';
import { projectLogger, createModuleLogger } from './logging-utils';

const log = createModuleLogger(projectLogger, 'polling-block-tracker');
const createRandomId = getCreateRandomId();
const sec = 1000;

export interface PollingBlockTrackerOptions {
  provider?: SafeEventEmitterProvider;
  pollingInterval?: number;
  retryTimeout?: number;
  keepEventLoopActive?: boolean;
  setSkipCacheFlag?: boolean;
  blockResetDuration?: number;
  usePastBlocks?: boolean;
}

interface ExtendedJsonRpcRequest<T> extends JsonRpcRequest<T> {
  skipCache?: boolean;
}

export class PollingBlockTracker extends BaseBlockTracker {
  private readonly _provider: SafeEventEmitterProvider;

  private readonly _pollingInterval: number;

  private readonly _retryTimeout: number;

  private readonly _keepEventLoopActive: boolean;

  private readonly _setSkipCacheFlag: boolean;

  constructor(opts: PollingBlockTrackerOptions = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('PollingBlockTracker - no provider specified.');
    }

    super({
      ...opts,
      blockResetDuration: opts.blockResetDuration ?? opts.pollingInterval,
    });

    // config
    this._provider = opts.provider;
    this._pollingInterval = opts.pollingInterval || 20 * sec;
    this._retryTimeout = opts.retryTimeout || this._pollingInterval / 10;
    this._keepEventLoopActive =
      opts.keepEventLoopActive === undefined ? true : opts.keepEventLoopActive;
    this._setSkipCacheFlag = opts.setSkipCacheFlag || false;
  }

  // trigger block polling
  async checkForLatestBlock() {
    await this._updateLatestBlock();
    return await this.getLatestBlock();
  }

  protected async _start(): Promise<void> {
    this._synchronize();
  }

  protected async _end(): Promise<void> {
    // No-op
  }

  private async _synchronize(): Promise<void> {
    while (this._isRunning) {
      try {
        await this._updateLatestBlock();
        const promise = timeout(
          this._pollingInterval,
          !this._keepEventLoopActive,
        );
        this.emit('_waitingForNextIteration');
        await promise;
      } catch (err: any) {
        const newErr = new Error(
          `PollingBlockTracker - encountered an error while attempting to update latest block:\n${
            err.stack ?? err
          }`,
        );
        console.error(newErr);
        try {
          this.emit('error', newErr);
        } catch (emitErr) {
          // No "error" listener is attached
        }
        const promise = timeout(this._retryTimeout, !this._keepEventLoopActive);
        this.emit('_waitingForNextIteration');
        await promise;
      }
    }
  }

  private async _updateLatestBlock(): Promise<void> {
    // fetch + set latest block
    const latestBlock = await this._fetchLatestBlock();
    this._newPotentialLatest(latestBlock);
  }

  private async _fetchLatestBlock(): Promise<string> {
    const req: ExtendedJsonRpcRequest<[]> = {
      jsonrpc: '2.0',
      id: createRandomId(),
      method: 'eth_blockNumber',
      params: [],
    };
    if (this._setSkipCacheFlag) {
      req.skipCache = true;
    }

    log('Making request', req);
    const res = await pify((cb) => this._provider.sendAsync(req, cb))();
    log('Got response', res);
    if (res.error) {
      throw new Error(
        `PollingBlockTracker - encountered error fetching block:\n${res.error.message}`,
      );
    }
    return res.result;
  }
}

/**
 * Waits for the specified amount of time.
 *
 * @param duration - The amount of time in milliseconds.
 * @param unref - Assuming this function is run in a Node context, governs
 * whether Node should wait before the `setTimeout` has completed before ending
 * the process (true for no, false for yes). Defaults to false.
 * @returns A promise that can be used to wait.
 */
async function timeout(duration: number, unref: boolean) {
  return new Promise((resolve) => {
    const timeoutRef = setTimeout(resolve, duration);
    // don't keep process open
    if (timeoutRef.unref && unref) {
      timeoutRef.unref();
    }
  });
}
