import SafeEventEmitter from '@metamask/safe-event-emitter';

const calculateSum = (accumulator: number, currentValue: number) =>
  accumulator + currentValue;
const chainResetTrackerEvents: (string | symbol)[] = ['reset'];

interface Block {
  number: string | null
  hash: string | null
}

interface BaseChainResetTrackerArgs {
}

export abstract class BaseChainResetTracker extends SafeEventEmitter {
  protected _isRunning: boolean;

  private _currentBlock: Block;

  constructor(opts: BaseChainResetTrackerArgs) {
    super();

    // state
    this._currentBlock = {
      number: null,
      hash: null
    };
    this._isRunning = false;

    // bind functions for internal use
    this._onNewListener = this._onNewListener.bind(this);
    this._onRemoveListener = this._onRemoveListener.bind(this);
    this._resetCurrentBlock = this._resetCurrentBlock.bind(this);

    // listen for handler changes
    this._setupInternalEvents();
  }

  async destroy() {
    await this._maybeEnd();
    super.removeAllListeners();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  getCurrentBlock(): Block {
    return this._currentBlock;
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
  protected abstract _start(): Promise<void>;

  /**
   * To be implemented in subclass.
   */
  protected abstract _end(): Promise<void>;

  private _setupInternalEvents(): void {
    // first remove listeners for idempotence
    this.removeListener('newListener', this._onNewListener);
    this.removeListener('removeListener', this._onRemoveListener);
    // then add them
    this.on('newListener', this._onNewListener);
    this.on('removeListener', this._onRemoveListener);
  }

  private _onNewListener(eventName: string | symbol): void {
    // `newListener` is called *before* the listener is added
    if (chainResetTrackerEvents.includes(eventName)) {
      this._maybeStart();
    }
  }

  private _onRemoveListener(): void {
    // `removeListener` is called *after* the listener is removed
    if (this._getTrackerEventCount() > 0) {
      return;
    }
    this._maybeEnd();
  }

  private async _maybeStart(): Promise<void> {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;
    await this._start();
    this.emit('_started');
  }

  private async _maybeEnd(): Promise<void> {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;
    await this._end();
    this.emit('_ended');
  }

  private _getTrackerEventCount(): number {
    return chainResetTrackerEvents
      .map((eventName) => this.listenerCount(eventName))
      .reduce(calculateSum);
  }

  protected _useNewBlock(newBlock: Block): void {
    const currentBlock = this._currentBlock;
    if (!newBlock.number) {
      //shouldn't be happening, ignore
      return
    }
    if (!currentBlock.number || !currentBlock.hash) {
      this._setCurrentBlock(newBlock)
      return
    }
    if (!newBlock.hash) {
      this._emitReset(newBlock)
      this._resetCurrentBlock()
      return
    }

    const newBlockNumberInt = hexToInt(newBlock.number);
    const currentBlockNumberInt = hexToInt(currentBlock.number);

    if (newBlockNumberInt < currentBlockNumberInt) {
      this._emitReset(newBlock)
    }

    if (newBlockNumberInt === currentBlockNumberInt && newBlock.hash !== currentBlock.hash) {
      this._emitReset(newBlock)
    }

    this._setCurrentBlock(newBlock)
  }

  protected _emitReset(newBlock: Block): void {
    this.emit('reset', {
      oldBlock: this._currentBlock,
      newBlock
    })
  }

  private _setCurrentBlock(newBlock: Block): void {
    this._currentBlock = newBlock
  }

  private _resetCurrentBlock(): void {
    this._currentBlock = {
      number: null,
      hash: null
    };
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
