import SafeEventEmitter from '@metamask/safe-event-emitter';

const sec = 1000;

const calculateSum = (accumulator: number, currentValue: number) =>
  accumulator + currentValue;
const blockTrackerEvents: (string | symbol)[] = ['sync', 'latest'];

type SimpleJson = boolean | number | string | null;

interface JsonRpcBase {
  jsonrpc: '2.0';
  id: number | string | null;
}

export type JsonRpcRequest<
  M extends string,
  P extends Record<string, SimpleJson> | SimpleJson[] = never,
> = JsonRpcBase & {
  method: M;
  params?: P;
};

export type JsonRpcSuccess<T> = JsonRpcBase & {
  result: T;
};
export type JsonRpcFailure = JsonRpcBase & {
  error: {
    code: number;
    message: string;
    data?: any;
  };
};
export type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

// This seems to be the community-recommended way to say "everything except null
// or undefined". See: <https://github.com/microsoft/TypeScript/issues/7648>
/* eslint-disable-next-line @typescript-eslint/ban-types */
export type ErrorLike = string | number | boolean | symbol | object;

export interface SendAsyncCallback<T> {
  (err: null, providerRes: JsonRpcResponse<T>): void;
  (err: ErrorLike, providerRes: null): void;
}

export interface SupportedRpcMethods {
  /* eslint-disable-next-line camelcase */
  eth_blockNumber: {
    requestParams: never[];
    responseResult: string;
  };
  /* eslint-disable-next-line camelcase */
  eth_subscribe: {
    requestParams: ['newHeads'];
    responseResult: string;
  };
  /* eslint-disable-next-line camelcase */
  eth_unsubscribe: {
    requestParams: [string];
    responseResult: boolean;
  };
}

export type SendAsyncCallbackArguments = {
  [K in keyof SupportedRpcMethods]: {
    request: JsonRpcRequest<K, SupportedRpcMethods[K]['requestParams']>;
    callback: SendAsyncCallback<SupportedRpcMethods[K]['responseResult']>;
  };
};

export interface Provider extends SafeEventEmitter {
  sendAsync<T extends keyof SendAsyncCallbackArguments>(
    req: SendAsyncCallbackArguments[T]['request'],
    callback: SendAsyncCallbackArguments[T]['callback'],
  ): void;
}

export interface BaseBlockTrackerOptions {
  provider?: Provider;
  blockResetDuration?: number | undefined;
}

export class BaseBlockTracker extends SafeEventEmitter {
  protected _isRunning: boolean;

  private _blockResetDuration: number;

  private _currentBlock: string | null;

  private _blockResetTimeout?: ReturnType<typeof setTimeout>;

  constructor(opts: BaseBlockTrackerOptions = {}) {
    super();

    // config
    this._blockResetDuration = opts.blockResetDuration || 20 * sec;
    // state
    this._currentBlock = null;
    this._isRunning = false;

    // bind functions for internal use
    this._onNewListener = this._onNewListener.bind(this);
    this._onRemoveListener = this._onRemoveListener.bind(this);
    this._resetCurrentBlock = this._resetCurrentBlock.bind(this);

    // listen for handler changes
    this._setupInternalEvents();
  }

  // TODO: This is new
  async destroy() {
    // NEW CHANGE: end first before removing the listeners —
    // that way we can still emit 'error' if unsubscribe doesn't work
    await this._maybeEnd();
    this._cancelBlockResetTimeout();
    super.removeAllListeners();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  getCurrentBlock(): string | null {
    return this._currentBlock;
  }

  async getLatestBlock(): Promise<string> {
    // return if available
    if (this._currentBlock) {
      return this._currentBlock;
    }
    // wait for a new latest block
    const latestBlock: string = await new Promise((resolve) =>
      this.once('latest', resolve),
    );
    // return newly set current block
    return latestBlock;
  }

  // dont allow module consumer to remove our internal event listeners
  removeAllListeners(eventName?: string | symbol) {
    // perform default behavior, preserve fn arity
    if (eventName) {
      super.removeAllListeners(eventName);
    } else {
      super.removeAllListeners();
    }

    // re-add internal events
    this._setupInternalEvents();

    // trigger stop check just in case
    this._onRemoveListener();

    return this;
  }

  /**
   * To be implemented in subclass.
   */
  protected async _start(): Promise<void> {
    // default behavior is noop
  }

  /**
   * To be implemented in subclass.
   */
  protected async _end(): Promise<void> {
    // default behavior is noop
  }

  private _setupInternalEvents(): void {
    // first remove listeners for idempotence
    this.removeListener('newListener', this._onNewListener);
    this.removeListener('removeListener', this._onRemoveListener);
    // then add them
    // (UPDATE: add removeListener first so it doesn't trigger newListener)
    this.on('removeListener', this._onRemoveListener);
    this.on('newListener', this._onNewListener);
  }

  // Called *before* the listener is added
  protected _onNewListener(eventName: string | symbol): void {
    if (blockTrackerEvents.includes(eventName)) {
      this._maybeStart();
    }
  }

  // Called *after* the listener is removed
  protected _onRemoveListener(): void {
    if (this._getBlockTrackerEventCount() === 0) {
      this._maybeEnd();
    }
  }

  private _maybeStart(): void {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;
    // cancel setting latest block to stale
    this._cancelBlockResetTimeout();
    this._start().then(() => {
      this.emit('_started');
    });
  }

  private async _maybeEnd(): Promise<void> {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;
    this._setupBlockResetTimeout();
    await this._end();
    this.emit('_ended');
  }

  private _getBlockTrackerEventCount(): number {
    return blockTrackerEvents
      .map((eventName) => this.listenerCount(eventName))
      .reduce(calculateSum);
  }

  protected _newPotentialLatest(newBlock: string): void {
    const currentBlock = this._currentBlock;
    // only update if blok number is higher
    if (currentBlock && hexToInt(newBlock) <= hexToInt(currentBlock)) {
      return;
    }
    this._setCurrentBlock(newBlock);
  }

  private _setCurrentBlock(newBlock: string): void {
    const oldBlock = this._currentBlock;
    this._currentBlock = newBlock;
    this.emit('latest', newBlock);
    this.emit('sync', { oldBlock, newBlock });
  }

  private _setupBlockResetTimeout(): void {
    // clear any existing timeout
    this._cancelBlockResetTimeout();
    // clear latest block when stale
    this._blockResetTimeout = setTimeout(
      this._resetCurrentBlock,
      this._blockResetDuration,
    );

    // nodejs - dont hold process open
    if (this._blockResetTimeout.unref) {
      this._blockResetTimeout.unref();
    }
  }

  private _cancelBlockResetTimeout(): void {
    if (this._blockResetTimeout) {
      clearTimeout(this._blockResetTimeout);
    }
  }

  private _resetCurrentBlock(): void {
    this._currentBlock = null;
  }
}

/**
 * Converts a number represented as a string in hexadecimal format into a native
 * number.
 *
 * @param hexInt - The hex string.
 * @returns The number.
 */
function hexToInt(hexInt: string): number {
  return Number.parseInt(hexInt, 16);
}
