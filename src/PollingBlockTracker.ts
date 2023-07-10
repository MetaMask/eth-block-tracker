import getCreateRandomId from 'json-rpc-random-id';
import pify from 'pify';
import { JsonRpcRequest } from 'json-rpc-engine';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { BaseChainResetTracker } from './BaseChainResetTracker';
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
}

interface ExtendedJsonRpcRequest<T> extends JsonRpcRequest<T> {
  skipCache?: boolean;
}

export class PollingChainResetTracker extends BaseChainResetTracker {
  private _provider: SafeEventEmitterProvider;

  private _pollingInterval: number;

  private _retryTimeout: number;

  private _keepEventLoopActive: boolean;

  private _setSkipCacheFlag: boolean;

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

  async checkNewBlock(newBlockNumber: string) {
    await this._checkCurrentBlock()
    const hash = await this._fetchBlockHash(newBlockNumber);
    this._useNewBlock({
      number: newBlockNumber,
      hash
    })
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
        await this._checkCurrentBlock();
        const promise = timeout(
          this._pollingInterval,
          !this._keepEventLoopActive,
        );
        this.emit('_waitingForNextIteration');
        await promise;
      } catch (err: any) {
        const newErr = new Error(
          `PollingChainResetTracker - encountered an error while attempting to check current block:\n${
            err.stack ?? err
          }`,
        );
        try {
          this.emit('error', newErr);
        } catch (emitErr) {
          console.error(newErr);
        }
        const promise = timeout(this._retryTimeout, !this._keepEventLoopActive);
        this.emit('_waitingForNextIteration');
        await promise;
      }
    }
  }

  private async _checkCurrentBlock(): Promise<void> {
    const currentBlock = this.getCurrentBlock()
    if (!currentBlock.number || !currentBlock.hash) {
      return
    }
    const hash = await this._fetchBlockHash(currentBlock.number);
    this._useNewBlock({
      ...currentBlock,
      hash
    })
  }

  private async _fetchBlockHash(blockNumber: string): Promise<string | null> {
    const req: ExtendedJsonRpcRequest<[string, boolean]> = {
      jsonrpc: '2.0',
      id: createRandomId(),
      method: 'eth_getBlockByNumber',
      params: [blockNumber, false],
    };
    if (this._setSkipCacheFlag) {
      req.skipCache = true;
    }

    log('Making request', req);
    const res = await pify((cb) => this._provider.sendAsync(req, cb))();
    log('Got response', res);
    if (res.error) {
      throw new Error(
        `PollingChainResetTracker - encountered error fetching block:\n${res.error.message}`,
      );
    }
    return res.result?.hash || null;
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
function timeout(duration: number, unref: boolean) {
  return new Promise((resolve) => {
    const timeoutRef = setTimeout(resolve, duration);
    // don't keep process open
    if (timeoutRef.unref && unref) {
      timeoutRef.unref();
    }
  });
}
