import getCreateRandomId from 'json-rpc-random-id';
import { JsonRpcNotification } from 'json-rpc-engine';
import {
  BaseBlockTracker,
  BaseBlockTrackerOptions,
  ErrorLike,
  JsonRpcResponse,
  Provider,
  SendAsyncCallbackArguments,
  SupportedRpcMethods,
} from './BaseBlockTracker';

const createRandomId = getCreateRandomId();

<<<<<<< HEAD
export interface SubscribeBlockTrackerOptions {
  provider?: Provider;
  blockResetDuration?: number;
}
=======
export type SubscribeBlockTrackerOptions = BaseBlockTrackerOptions;
>>>>>>> a27dfea (Convert tests to Jest, clean up behavior)

interface SubscriptionNotificationParams {
  subscription: string;
  result: { number: string };
}

export class SubscribeBlockTracker extends BaseBlockTracker {
  private _provider: Provider;

  private _subscriptionId: string | null;

  constructor(opts: SubscribeBlockTrackerOptions = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('SubscribeBlockTracker - no provider specified.');
    }

    // BaseBlockTracker constructor
    super(opts);
    // config
    this._provider = opts.provider;
    this._subscriptionId = null;
  }

  async checkForLatestBlock(): Promise<string> {
    return await this.getLatestBlock();
  }

  protected async _start(): Promise<void> {
    await super._start();

    if (this._subscriptionId === undefined || this._subscriptionId === null) {
      let latestBlockNumber;

      try {
        latestBlockNumber = await this._call('eth_blockNumber');
      } catch (error: any) {
        const newErr = new Error(
          `SubscribeBlockTracker - encountered an error while attempting to update latest block:\n${
            error.stack ?? error.message ?? error
          }`,
        );
        this.emit('error', newErr);
      }

      try {
        this._subscriptionId = await this._call('eth_subscribe', ['newHeads']);
      } catch (error: any) {
        const newErr = new Error(
          `SubscribeBlockTracker - encountered an error while attempting to subscribe:\n${
            error.stack ?? error.message ?? error
          }`,
        );
        this.emit('error', newErr);
      }
      this._provider.on('data', this._handleSubData.bind(this));

      if (latestBlockNumber !== undefined) {
        this._newPotentialLatest(latestBlockNumber);
      }
    }
  }

  protected async _end(): Promise<void> {
    await super._end();

    if (this._subscriptionId !== null && this._subscriptionId !== undefined) {
      try {
        await this._call('eth_unsubscribe', [this._subscriptionId]);
        this._subscriptionId = null;
      } catch (error: any) {
        const newErr = new Error(
          `SubscribeBlockTracker - encountered an error while attempting to unsubscribe:\n${
            error.stack ?? error.message ?? error
          }`,
        );
        this.emit('error', newErr);
      }
    }
  }

  private _call<T extends keyof SupportedRpcMethods>(
    method: T,
    params: SupportedRpcMethods[T]['requestParams'] = [],
  ): Promise<SupportedRpcMethods[T]['responseResult']> {
    return new Promise((resolve, reject) => {
      const request: SendAsyncCallbackArguments[T]['request'] = {
        id: createRandomId(),
        method,
        params,
        jsonrpc: '2.0',
      };
      this._provider.sendAsync(
        request,
        (
          err: ErrorLike | null,
          res: JsonRpcResponse<SupportedRpcMethods[T]['responseResult']> | null,
        ) => {
          if (err) {
            reject(err);
          } else if (res) {
            if ('error' in res) {
              reject(res.error);
            } else {
              resolve(res.result);
            }
          }
        },
      );
    });
  }

  private _handleSubData(
    _: unknown,
    response: JsonRpcNotification<SubscriptionNotificationParams>,
  ): void {
    if (
      response.method === 'eth_subscription' &&
      // TODO: Test
      response.params?.subscription === this._subscriptionId
    ) {
      this._newPotentialLatest(response.params.result.number);
    }
  }
}
