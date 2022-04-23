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

interface WithPollingBlockTrackerTypes {
  withBlockTrackerCallback: (args: {
    provider: FakeProvider;
    blockTracker: PollingBlockTracker;
  }) => void | Promise<void>;
  withBlockTrackerOptions: {
    provider?: FakeProviderOptions;
    blockTracker?: PollingBlockTrackerOptions;
  };
}

interface WithSubscribeBlockTrackerTypes {
  withBlockTrackerCallback: (args: {
    provider: FakeProvider;
    blockTracker: SubscribeBlockTracker;
  }) => void | Promise<void>;
  withBlockTrackerOptions: {
    provider?: FakeProviderOptions;
    blockTracker?: SubscribeBlockTrackerOptions;
  };
}

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

interface FakeProviderOptions {
  stubs?: FakeProviderStub[];
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
 * Calls the given function with a built-in PollingBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param options - Options that allow configuring the block tracker or
 * provider.
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withPollingBlockTracker(
  options: WithPollingBlockTrackerTypes['withBlockTrackerOptions'],
  callback: WithPollingBlockTrackerTypes['withBlockTrackerCallback'],
): Promise<void>;
/**
 * Calls the given function with a built-in PollingBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withPollingBlockTracker(
  callback: WithPollingBlockTrackerTypes['withBlockTrackerCallback'],
): Promise<void>;
/* eslint-disable-next-line jsdoc/require-jsdoc */
async function withPollingBlockTracker(...args: any[]) {
  const callback: WithPollingBlockTrackerTypes['withBlockTrackerCallback'] =
    args.pop();
  const options =
    (args[0] as WithPollingBlockTrackerTypes['withBlockTrackerOptions']) ?? {};
  const provider =
    options.provider === undefined
      ? new FakeProvider()
      : new FakeProvider(options.provider);

  const blockTrackerOptions =
    options.blockTracker === undefined
      ? { provider }
      : {
          provider,
          ...options.blockTracker,
        };
  const blockTracker = new PollingBlockTracker(blockTrackerOptions);
  const callbackArgs = { provider, blockTracker };
  await callback(callbackArgs);
}

/**
 * Calls the given function with a built-in SubscribeBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param options - Options that allow configuring the block tracker or
 * provider.
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withSubscribeBlockTracker(
  options: WithSubscribeBlockTrackerTypes['withBlockTrackerOptions'],
  callback: WithSubscribeBlockTrackerTypes['withBlockTrackerCallback'],
): Promise<void>;
/**
 * Calls the given function with a built-in SubscribeBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withSubscribeBlockTracker(
  callback: WithSubscribeBlockTrackerTypes['withBlockTrackerCallback'],
): Promise<void>;
/* eslint-disable-next-line jsdoc/require-jsdoc */
async function withSubscribeBlockTracker(...args: any[]): Promise<void> {
  const callback: WithSubscribeBlockTrackerTypes['withBlockTrackerCallback'] =
    args.pop();
  const options =
    (args[0] as WithSubscribeBlockTrackerTypes['withBlockTrackerOptions']) ??
    {};
  const provider =
    options.provider === undefined
      ? new FakeProvider()
      : new FakeProvider(options.provider);

  const blockTrackerOptions =
    options.blockTracker === undefined
      ? { provider }
      : {
          provider,
          ...options.blockTracker,
        };
  const blockTracker = new SubscribeBlockTracker(blockTrackerOptions);
  const callbackArgs = { provider, blockTracker };
  await callback(callbackArgs);
}

export { withPollingBlockTracker, withSubscribeBlockTracker };
