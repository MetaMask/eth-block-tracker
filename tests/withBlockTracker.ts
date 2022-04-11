import util from 'util';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { JsonRpcRequest, JsonRpcResponse } from 'json-rpc-engine';
import { Provider } from '../src/BaseBlockTracker';
import {
  SubscribeBlockTracker,
  SubscribeBlockTrackerOptions,
} from '../src/SubscribeBlockTracker';
import {
  PollingBlockTracker,
  PollingBlockTrackerOptions,
} from '../src/PollingBlockTracker';

type BlockTracker = PollingBlockTracker | SubscribeBlockTracker;
type BlockTrackerOptions<T> = T extends typeof PollingBlockTracker
  ? PollingBlockTrackerOptions
  : T extends typeof SubscribeBlockTracker
  ? SubscribeBlockTrackerOptions
  : never;
type BlockTrackerConstructor<T extends BlockTracker> = new (
  options?: BlockTrackerOptions<T>,
) => T;

type FakeProviderStub =
  | {
      methodName: string;
      response: { result: any } | { error: string };
    }
  | {
      methodName: string;
      implementation: () => void;
    }
  | {
      methodName: string;
      error: string;
    };

export type WithBlockTrackerCallback<T extends BlockTracker> = (args: {
  provider: FakeProvider;
  blockTracker: T;
}) => void | Promise<void>;

interface FakeProviderOptions {
  stubs?: FakeProviderStub[];
}

export interface WithBlockTrackerOptions<T extends BlockTracker> {
  blockTracker?: {
    [K in keyof BlockTrackerOptions<T>]?: BlockTrackerOptions<T>[K];
  };
  provider?: FakeProviderOptions;
}

/**
 * FakeProvider is an implementation of the provider that a subclass of
 * BaseBlockTracker takes, supporting the same expected methods with the same
 * expected interface, except that fake responses for the various RPC methods
 * that the provider supports can be supplied. This ends up easier to define
 * than using `jest.spyOn(...).mockImplementationOnce(...)` due to the types
 * that `sendAsync` takes.
 */
class FakeProvider extends SafeEventEmitter implements Provider {
  private stubs: FakeProviderStub[];

  private originalStubs: FakeProviderStub[];

  constructor({ stubs = [] }: FakeProviderOptions = {}) {
    super();
    this.stubs = this.buildStubsFrom(stubs);
    this.originalStubs = this.stubs.slice();
  }

  sendAsync<T, U>(
    request: JsonRpcRequest<T>,
    callback: (err: Error, response: JsonRpcResponse<U>) => void,
  ) {
    const index = this.stubs.findIndex(
      (stub) => stub.methodName === request.method,
    );

    if (index !== -1) {
      const stub = this.stubs[index];
      this.stubs.splice(index, 1);
      if ('implementation' in stub) {
        stub.implementation();
      } else if ('response' in stub) {
        if ('result' in stub.response) {
          callback(null as unknown as Error, {
            jsonrpc: '2.0',
            id: 1,
            result: stub.response.result,
          });
        } else if ('error' in stub.response) {
          callback(null as unknown as Error, {
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: -999,
              message: stub.response.error,
            },
          });
        }
      } else if ('error' in stub) {
        callback(new Error(stub.error), null as unknown as JsonRpcResponse<U>);
      }
      return;
    }

    callback(
      new Error(
        `Could not find any stubs matching "${request.method}". Perhaps they've already been called?\n\n` +
          'The original set of stubs were:\n\n' +
          `${util.inspect(this.originalStubs, { depth: null })}\n\n` +
          'Current set of stubs:\n\n' +
          `${util.inspect(this.stubs, { depth: null })}\n\n`,
      ),
      null as unknown as JsonRpcResponse<U>,
    );
  }

  private buildStubsFrom(givenStubs: FakeProviderStub[]): FakeProviderStub[] {
    const stubs = givenStubs.slice();

    if (!stubs.some((stub) => stub.methodName === 'eth_blockNumber')) {
      stubs.push({
        methodName: 'eth_blockNumber',
        response: {
          result: '0x0',
        },
      });
    }

    if (!stubs.some((stub) => stub.methodName === 'eth_subscribe')) {
      stubs.push({
        methodName: 'eth_subscribe',
        response: {
          result: '0x0',
        },
      });
    }

    if (!stubs.some((stub) => stub.methodName === 'eth_unsubscribe')) {
      stubs.push({
        methodName: 'eth_unsubscribe',
        response: {
          result: true,
        },
      });
    }

    return stubs;
  }
}

/**
 * Calls the given function with the given subclass of BaseBlockTracker,
 * ensuring that all listeners that are on the block tracker are removed and any
 * timers or loops that are running within the block tracker are properly
 * stopped.
 *
 * @param BlockTracker - A subclass of BaseBlockTracker.
 * @param options - Options that allow configuring the block tracker or
 * provider.
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withBlockTracker<T extends BlockTracker>(
  BlockTracker: BlockTrackerConstructor<T>,
  options: WithBlockTrackerOptions<T>,
  callback: WithBlockTrackerCallback<T>,
): Promise<void>;
/**
 * Calls the given function with the given subclass of BaseBlockTracker,
 * ensuring that all listeners that are on the block tracker are removed and any
 * timers or loops that are running within the block tracker are properly
 * stopped.
 *
 * @param BlockTracker - A subclass of BaseBlockTracker.
 * @param callback - A callback which will be called with the built instance of
 * `BlockTracker`.
 */
async function withBlockTracker<T extends BlockTracker>(
  BlockTracker: BlockTrackerConstructor<T>,
  callback: WithBlockTrackerCallback<T>,
): Promise<void>;
/* eslint-disable-next-line jsdoc/require-jsdoc */
async function withBlockTracker<T extends BlockTracker>(
  ...args: [BlockTrackerConstructor<T>, ...any[], WithBlockTrackerCallback<T>]
): Promise<void> {
  const BlockTracker: BlockTrackerConstructor<T> = args.shift();
  const callback: WithBlockTrackerCallback<T> = args.pop();
  const options = (args[0] as WithBlockTrackerOptions<T>) ?? {};
  const provider =
    options.provider === undefined
      ? new FakeProvider()
      : new FakeProvider(options.provider);

  // I am honestly not sure why we have to do this — and we can't seem to check
  // to see what BlockTracker is first
  const blockTrackerOptions =
    options.blockTracker === undefined
      ? ({ provider } as unknown as BlockTrackerOptions<T>)
      : ({
          provider,
          ...options.blockTracker,
        } as unknown as BlockTrackerOptions<T>);
  const blockTracker = new BlockTracker(blockTrackerOptions);
  await callback({ provider, blockTracker });
}

export default withBlockTracker;
