import type { Json } from '@metamask/utils';

import { PollingBlockTracker } from '.';
import buildDeferred from '../tests/buildDeferred';
import EMPTY_FUNCTION from '../tests/emptyFunction';
import recordCallsToSetTimeout from '../tests/recordCallsToSetTimeout';
import { withPollingBlockTracker } from '../tests/withBlockTracker';

interface Sync {
  oldBlock: string;
  newBlock: string;
}

const METHODS_TO_ADD_LISTENER = ['on', 'addListener'] as const;
const METHODS_TO_REMOVE_LISTENER = ['off', 'removeListener'] as const;
const originalSetTimeout = setTimeout;

describe('PollingBlockTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should throw if given no options', () => {
      expect(() => new PollingBlockTracker()).toThrow(
        'PollingBlockTracker - no provider specified.',
      );
    });

    it('should throw if given options but not given a provider', () => {
      expect(() => new PollingBlockTracker({})).toThrow(
        'PollingBlockTracker - no provider specified.',
      );
    });

    it('should return a block tracker that is not running', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(({ blockTracker }) => {
        expect(blockTracker.isRunning()).toBe(false);
      });
    });
  });

  describe('destroy', () => {
    it('should stop the block tracker if any "latest" and "sync" events were added previously', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(async ({ blockTracker }) => {
        blockTracker.on('latest', EMPTY_FUNCTION);
        await new Promise<void>((resolve) => {
          blockTracker.on('sync', resolve);
        });
        expect(blockTracker.isRunning()).toBe(true);

        await blockTracker.destroy();

        expect(blockTracker.isRunning()).toBe(false);
      });
    });
  });

  describe('getLatestBlock', () => {
    describe('when the block tracker is not running', () => {
      describe('if no other concurrent call exists', () => {
        describe('if the latest block number has already been fetched once', () => {
          it('returns the block number', async () => {
            recordCallsToSetTimeout();

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                await blockTracker.getLatestBlock();
                const block = await blockTracker.getLatestBlock();
                expect(block).toBe('0x1');
              },
            );
          });
        });

        describe('if the latest block number has not been fetched yet', () => {
          it('does not start the block tracker', async () => {
            recordCallsToSetTimeout();

            await withPollingBlockTracker(async ({ blockTracker }) => {
              expect(blockTracker.isRunning()).toBe(false);
              blockTracker.getLatestBlock();
              expect(blockTracker.isRunning()).toBe(false);
            });
          });

          describe('if the latest block number is successfully fetched', () => {
            it('returns the fetched latest block number', async () => {
              recordCallsToSetTimeout();

              await withPollingBlockTracker(async ({ blockTracker }) => {
                const block = await blockTracker.getLatestBlock();
                expect(block).toBe('0x0');
              });
            });
          });

          describe('if an error occurs while fetching the latest block number', () => {
            it('re-throws the error', async () => {
              recordCallsToSetTimeout();

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        error: new Error('boom'),
                      },
                    ],
                  },
                },
                async ({ blockTracker }) => {
                  await expect(blockTracker.getLatestBlock()).rejects.toThrow(
                    'boom',
                  );
                },
              );
            });

            it('does not emit "error"', async () => {
              recordCallsToSetTimeout();

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        error: new Error('boom'),
                      },
                    ],
                  },
                },
                async ({ blockTracker }) => {
                  const errorListener = jest.fn();
                  blockTracker.on('error', errorListener);
                  await expect(blockTracker.getLatestBlock()).rejects.toThrow(
                    'boom',
                  );
                  expect(errorListener).not.toHaveBeenCalled();
                },
              );
            });
          });
        });
      });

      describe('if already called concurrently', () => {
        describe('if the latest block number is successfully fetched', () => {
          it('returns the block number that the other call returns', async () => {
            recordCallsToSetTimeout();

            await withPollingBlockTracker(async ({ blockTracker }) => {
              const promise1 = blockTracker.getLatestBlock();
              const promise2 = blockTracker.getLatestBlock();
              const [block1, block2] = await Promise.all([promise1, promise2]);
              expect(block1).toBe(block2);
            });
          });
        });

        describe('if an error occurs while fetching the latest block number', () => {
          it('throws the error that the other call throws', async () => {
            const thrownError = new Error('boom');
            recordCallsToSetTimeout();

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      error: thrownError,
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const promise1 = blockTracker.getLatestBlock();
                const promise2 = blockTracker.getLatestBlock();
                await expect(promise1).rejects.toThrow(thrownError);
                await expect(promise2).rejects.toThrow(thrownError);
              },
            );
          });
        });
      });

      it('request the latest block number with `skipCache: true` if the block tracker was initialized with `setSkipCacheFlag: true`', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(
          { blockTracker: { setSkipCacheFlag: true } },
          async ({ provider, blockTracker }) => {
            jest.spyOn(provider, 'request');

            await blockTracker.getLatestBlock();

            expect(provider.request).toHaveBeenCalledWith({
              jsonrpc: '2.0' as const,
              id: expect.any(Number),
              method: 'eth_blockNumber' as const,
              params: [],
              skipCache: true,
            });
          },
        );
      });

      it('should not ask for a new block number while the current block number is cached', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(async ({ provider, blockTracker }) => {
          const requestSpy = jest.spyOn(provider, 'request');
          await blockTracker.getLatestBlock();
          await blockTracker.getLatestBlock();
          const requestsForLatestBlock = requestSpy.mock.calls.filter(
            (args) => {
              return args[0].method === 'eth_blockNumber';
            },
          );
          expect(requestsForLatestBlock).toHaveLength(1);
        });
      });
    });

    describe('when the block tracker is already started', () => {
      it('should return a promise that rejects if there is no existing block number cached and the request fails', async () => {
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  error: new Error('boom'),
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            blockTracker.on('latest', EMPTY_FUNCTION);

            const latestBlockPromise = blockTracker.getLatestBlock();

            await expect(latestBlockPromise).rejects.toThrow('boom');
          },
        );
      });

      it('should not retry failed requests after the block tracker is stopped', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout({
          numAutomaticCalls: 1,
        });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  error: new Error('boom'),
                },
                {
                  methodName: 'eth_blockNumber',
                  error: new Error('boom'),
                },
              ],
            },
          },
          async ({ blockTracker, provider }) => {
            blockTracker.on('latest', EMPTY_FUNCTION);
            const requestSpy = jest.spyOn(provider, 'request');

            await blockTracker.destroy();

            expect(requestSpy).toHaveBeenCalledTimes(1);
            expect(requestSpy).toHaveBeenCalledWith({
              jsonrpc: '2.0',
              id: expect.any(Number),
              method: 'eth_blockNumber',
              params: [],
            });

            await setTimeoutRecorder.next();
            expect(setTimeoutRecorder.calls).toHaveLength(0); // no more pending setTimeouts left
            expect(requestSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should log an error if, while making a request for the latest block number, the provider throws and there is nothing listening to "error"', async () => {
        const thrownError = new Error('boom');
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  implementation: () => {
                    throw thrownError;
                  },
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            blockTracker.on('latest', EMPTY_FUNCTION);
            jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

            await expect(blockTracker.getLatestBlock()).rejects.toThrow('boom');
            await new Promise((resolve) => {
              blockTracker.on('_waitingForNextIteration', resolve);
            });

            expect(console.error).toHaveBeenCalledWith(
              'Error updating latest block: boom',
            );
          },
        );
      });

      it('should log an error if, while requesting the latest block number, the provider rejects and there is nothing listening to "error"', async () => {
        const thrownError = new Error('boom');
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  error: thrownError,
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            blockTracker.on('latest', EMPTY_FUNCTION);
            jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

            await expect(blockTracker.getLatestBlock()).rejects.toThrow('boom');
            await new Promise((resolve) => {
              blockTracker.on('_waitingForNextIteration', resolve);
            });

            expect(console.error).toHaveBeenCalledWith(
              'Error updating latest block: boom',
            );
          },
        );
      });

      it('should update the current block number', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            blockTracker.on('latest', EMPTY_FUNCTION);
            await blockTracker.getLatestBlock();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toBe('0x0');
          },
        );
      });

      it('should clear the current block number some time after being called', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            blockTracker.on('latest', EMPTY_FUNCTION);
            await blockTracker.getLatestBlock();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toBe('0x0');
            await blockTracker.destroy();

            await setTimeoutRecorder.next();
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });

      describe('if no other concurrent call exists', () => {
        describe('if the latest block number has already been fetched once', () => {
          it('returns the block number', async () => {
            recordCallsToSetTimeout();

            await withPollingBlockTracker(async ({ blockTracker }) => {
              blockTracker.on('latest', EMPTY_FUNCTION);
              await blockTracker.getLatestBlock();
              const block = await blockTracker.getLatestBlock();
              expect(block).toBe('0x0');
            });
          });
        });

        describe('if the latest block number has not been fetched yet', () => {
          describe('if the latest block number is successfully fetched on the next poll iteration', () => {
            it('returns the fetched latest block number', async () => {
              recordCallsToSetTimeout();

              await withPollingBlockTracker(async ({ blockTracker }) => {
                blockTracker.on('latest', EMPTY_FUNCTION);
                const block = await blockTracker.getLatestBlock();
                expect(block).toBe('0x0');
              });
            });

            it('does not stop the block tracker once complete', async () => {
              recordCallsToSetTimeout();

              await withPollingBlockTracker(async ({ blockTracker }) => {
                blockTracker.on('latest', EMPTY_FUNCTION);
                await blockTracker.getLatestBlock();
                expect(blockTracker.isRunning()).toBe(true);
              });
            });
          });

          describe('if an error occurs while fetching the latest block number on the next poll iteration', () => {
            it('emits "error" if anything is listening to "error"', async () => {
              const thrownError = new Error('boom');
              recordCallsToSetTimeout();

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        error: thrownError,
                      },
                    ],
                  },
                },
                async ({ blockTracker }) => {
                  const errorListener = jest.fn();
                  blockTracker.on('error', errorListener);
                  blockTracker.on('latest', EMPTY_FUNCTION);
                  await expect(blockTracker.getLatestBlock()).rejects.toThrow(
                    'boom',
                  );
                  expect(errorListener).toHaveBeenCalledWith(thrownError);
                },
              );
            });

            it('logs an error if nothing is listening to "error"', async () => {
              const thrownError = new Error('boom');
              recordCallsToSetTimeout();

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        error: thrownError,
                      },
                    ],
                  },
                },
                async ({ blockTracker }) => {
                  jest
                    .spyOn(console, 'error')
                    .mockImplementation(EMPTY_FUNCTION);
                  blockTracker.on('latest', EMPTY_FUNCTION);
                  await expect(blockTracker.getLatestBlock()).rejects.toThrow(
                    'boom',
                  );
                  expect(console.error).toHaveBeenCalledWith(
                    'Error updating latest block: boom',
                  );
                },
              );
            });

            it('does not stop the block tracker once complete', async () => {
              const thrownError = new Error('boom');
              recordCallsToSetTimeout();

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        error: thrownError,
                      },
                    ],
                  },
                },
                async ({ blockTracker }) => {
                  blockTracker.on('latest', EMPTY_FUNCTION);
                  try {
                    await blockTracker.getLatestBlock();
                  } catch {
                    // do nothing
                  }
                  expect(blockTracker.isRunning()).toBe(true);
                },
              );
            });
          });
        });
      });

      describe('if already called concurrently', () => {
        describe('if the latest block number is successfully fetched on the next poll iteration', () => {
          it('returns the block number that the other call returns', async () => {
            recordCallsToSetTimeout();
            await withPollingBlockTracker(async ({ blockTracker }) => {
              blockTracker.on('latest', EMPTY_FUNCTION);
              const promise1 = blockTracker.getLatestBlock();
              const promise2 = blockTracker.getLatestBlock();
              const [block1, block2] = await Promise.all([promise1, promise2]);
              expect(block1).toBe(block2);
            });
          });

          it('does not stop the block tracker once complete', async () => {
            recordCallsToSetTimeout();

            await withPollingBlockTracker(async ({ blockTracker }) => {
              blockTracker.on('latest', EMPTY_FUNCTION);
              await blockTracker.getLatestBlock();
              expect(blockTracker.isRunning()).toBe(true);
            });
          });
        });

        describe('if an error occurs while fetching the latest block number on the next poll iteration', () => {
          it('throws the error that the other call throws', async () => {
            const thrownError = new Error('boom');
            recordCallsToSetTimeout();

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      error: thrownError,
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                blockTracker.on('latest', EMPTY_FUNCTION);
                const promise1 = blockTracker.getLatestBlock();
                const promise2 = blockTracker.getLatestBlock();
                await expect(promise1).rejects.toThrow(thrownError);
                await expect(promise2).rejects.toThrow(thrownError);
              },
            );
          });

          it('emits "error" only once if anything is listening to "error"', async () => {
            const thrownError = new Error('boom');
            recordCallsToSetTimeout();

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      error: thrownError,
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const errorListener = jest.fn();
                blockTracker.on('error', errorListener);
                blockTracker.on('latest', EMPTY_FUNCTION);
                const promise1 = blockTracker.getLatestBlock();
                const promise2 = blockTracker.getLatestBlock();
                await Promise.allSettled([promise1, promise2]);
                expect(errorListener).toHaveBeenCalledTimes(1);
              },
            );
          });

          it('logs an error only once if nothing is listening to "error"', async () => {
            const thrownError = new Error('boom');
            recordCallsToSetTimeout();

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      error: thrownError,
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);
                blockTracker.on('latest', EMPTY_FUNCTION);
                const promise1 = blockTracker.getLatestBlock();
                const promise2 = blockTracker.getLatestBlock();
                await Promise.allSettled([promise1, promise2]);
                expect(console.error).toHaveBeenCalledTimes(1);
              },
            );
          });

          it('does not stop the block tracker once complete', async () => {
            recordCallsToSetTimeout();

            await withPollingBlockTracker(async ({ blockTracker }) => {
              blockTracker.on('latest', EMPTY_FUNCTION);
              await blockTracker.getLatestBlock();
              expect(blockTracker.isRunning()).toBe(true);
            });
          });
        });
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should throw and emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request for the latest block number, the provider throws`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              const errorListener = jest.fn();
              expect(blockTracker.isRunning()).toBe(true);
              blockTracker[methodToAddListener]('error', errorListener);
              await expect(blockTracker.getLatestBlock()).rejects.toThrow(
                'boom',
              );
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              const latestBlock = await blockTracker.getLatestBlock();
              expect(latestBlock).toBe('0x0');
            },
          );
        });

        it(`should throw and emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: thrownError,
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              const errorListener = jest.fn();
              expect(blockTracker.isRunning()).toBe(true);
              blockTracker[methodToAddListener]('error', errorListener);
              await expect(blockTracker.getLatestBlock()).rejects.toThrow(
                'boom',
              );
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              const latestBlock = await blockTracker.getLatestBlock();
              expect(latestBlock).toBe('0x0');
            },
          );
        });
      });

      it('should return the block number if block tracker is destroyed before fetch completes on second getLatestBlock call', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            // Step 1: Start the block tracker
            blockTracker.on('latest', EMPTY_FUNCTION);

            // Step 2: Wait for the first block update to resolve
            await new Promise((resolve) => {
              blockTracker.on('sync', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toBe('0x0');
            expect(blockTracker.isRunning()).toBe(true);

            // Clear the current block to force a new request for the next getLatestBlock
            blockTracker.removeAllListeners();
            await setTimeoutRecorder.next();
            expect(blockTracker.getCurrentBlock()).toBeNull();

            // Restart the tracker for the second call
            blockTracker.on('latest', EMPTY_FUNCTION);

            // Step 3: Immediately after, call getLatestBlock
            const secondBlockPromise = blockTracker.getLatestBlock();

            // Step 4: Immediately after, destroy the block tracker
            await blockTracker.destroy();

            // Verify block tracker state
            expect(blockTracker.isRunning()).toBe(false);
            expect(blockTracker.getCurrentBlock()).toBeNull();

            // The call to getLatestBlock would then fetch the block since no block is cached
            expect(await secondBlockPromise).toBe('0x1');

            // Wait for the block to become stale
            await setTimeoutRecorder.next();

            // Verify that the current block is still null after the timeout
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });
    });

    describe('with useCache: false and an existing block number is cached', () => {
      describe('when the block tracker is not running', () => {
        it('should use the cached block if it is fresh (less than the polling interval time has passed since the last call)', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x2',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await blockTracker.getLatestBlock();
              const block = await blockTracker.getLatestBlock({
                useCache: false,
              });
              expect(block).toBe('0x1');
              expect(blockTracker.isRunning()).toBe(false);
            },
          );
        });

        it('should fetch a new block if the cached block is stale (more than the polling interval time has passed since the last call)', async () => {
          recordCallsToSetTimeout({
            numAutomaticCalls: 1,
          });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x2',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await blockTracker.getLatestBlock();
              const block = await blockTracker.getLatestBlock({
                useCache: false,
              });
              expect(block).toBe('0x2');
              expect(blockTracker.isRunning()).toBe(false);
            },
          );
        });
      });

      describe('when the block tracker is running', () => {
        it('should use the cached block if it is fresh (less than the polling interval time has passed since the last poll iteration)', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x2',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x3',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              blockTracker.on('latest', EMPTY_FUNCTION);

              await new Promise((resolve) => {
                blockTracker.once('_waitingForNextIteration', resolve);
              });

              const block1 = await blockTracker.getLatestBlock();
              expect(block1).toBe('0x1');

              await setTimeoutRecorder.next();

              const block2 = await blockTracker.getLatestBlock({
                useCache: false,
              });
              expect(block2).toBe('0x2');
            },
          );
        });

        it('should fetch a new block if the cached block is stale (more than the polling interval time has passed since the last poll iteration)', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [],
              },
            },

            async ({ provider, blockTracker }) => {
              const deferredRequestPromise = buildDeferred<Json>();
              const providerRequestMock = jest
                .spyOn(provider, 'request')
                .mockImplementationOnce(async () => Promise.resolve('0x1'))
                .mockImplementationOnce(async () => {
                  return deferredRequestPromise.promise;
                });

              blockTracker.on('latest', EMPTY_FUNCTION);

              const block1 = await blockTracker.getLatestBlock();
              expect(block1).toBe('0x1');

              // There should be one call to the provider from the first polling loop already
              expect(providerRequestMock).toHaveBeenCalledTimes(1);

              await setTimeoutRecorder.next();

              //  _updateLatestBlock should have been called by the polling loop causing
              // _fetchLatestBlock to fire and acquire the pending promise guard preventing
              // additional concurrent calls to fetch the latest block until the pending
              // deferred provider request is resolved.
              expect(providerRequestMock).toHaveBeenCalledTimes(2);
              expect(providerRequestMock).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: expect.any(Number),
                method: 'eth_blockNumber',
                params: [],
              });

              const blockPromise2 = blockTracker.getLatestBlock({
                useCache: false,
              });
              deferredRequestPromise.resolve('0x2');
              const block2 = await blockPromise2;
              expect(block2).toBe('0x2');
              //  _updateLatestBlock should have been called the another time by the getLatestBlock call
              // but the provider request should not have been made because _fetchLatestBlock
              // has an existing pending deferred promise guard preventing concurrent calls to fetch the
              // latest block.
              expect(providerRequestMock).toHaveBeenCalledTimes(2);
            },
          );
        });
      });
    });
  });

  describe('checkForLatestBlock', () => {
    it('should start the block tracker shortly after being called', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
              {
                methodName: 'eth_blockNumber',
                result: '0x1',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          blockTracker.checkForLatestBlock();
          await new Promise((resolve) => {
            blockTracker.on('latest', resolve);
          });
          expect(blockTracker.isRunning()).toBe(true);
        },
      );
    });

    it('should stop the block tracker automatically after its promise is fulfilled', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(async ({ blockTracker }) => {
        await blockTracker.checkForLatestBlock();
        expect(blockTracker.isRunning()).toBe(false);
      });
    });

    it('should return the same promise if called multiple times', async () => {
      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
              {
                methodName: 'eth_blockNumber',
                result: '0x1',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          const promiseToCheckLatestBlock1 = blockTracker.checkForLatestBlock();
          const promiseToCheckLatestBlock2 = blockTracker.checkForLatestBlock();

          expect(promiseToCheckLatestBlock1).toStrictEqual(
            promiseToCheckLatestBlock2,
          );
        },
      );
    });

    it('should fetch the latest block number', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          const latestBlockNumber = await blockTracker.checkForLatestBlock();
          expect(latestBlockNumber).toBe('0x0');
        },
      );
    });

    it('should update the current block number', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          await blockTracker.checkForLatestBlock();
          const currentBlockNumber = blockTracker.getCurrentBlock();
          expect(currentBlockNumber).toBe('0x0');
        },
      );
    });

    it('request the latest block number with `skipCache: true` if the block tracker was initialized with `setSkipCacheFlag: true`', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(
        { blockTracker: { setSkipCacheFlag: true } },
        async ({ provider, blockTracker }) => {
          jest.spyOn(provider, 'request');

          await blockTracker.checkForLatestBlock();

          expect(provider.request).toHaveBeenCalledWith({
            jsonrpc: '2.0' as const,
            id: expect.any(Number),
            method: 'eth_blockNumber' as const,
            params: [],
            skipCache: true,
          });
        },
      );
    });

    it(`should not emit the "error" event, but should throw instead, if, while making the request for the latest block number, the provider rejects with an error`, async () => {
      recordCallsToSetTimeout({ numAutomaticCalls: 1 });
      const thrownError = new Error('boom');

      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                error: new Error('boom'),
              },
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          const promiseForLatestBlock = blockTracker.checkForLatestBlock();
          await expect(promiseForLatestBlock).rejects.toThrow(thrownError);
        },
      );
    });

    it('should never start a timer to clear the current block number later', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();
      const blockResetDuration = 1000;

      await withPollingBlockTracker(
        {
          blockTracker: {
            blockResetDuration,
          },
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          await blockTracker.checkForLatestBlock();

          await new Promise((resolve) =>
            originalSetTimeout(resolve, blockResetDuration),
          );

          expect(setTimeoutRecorder.calls).toHaveLength(0);
          expect(blockTracker.getCurrentBlock()).toBe('0x0');
        },
      );
    });

    describe.each([
      ['not initialized with `usePastBlocks`', {}],
      ['initialized with `usePastBlocks: false`', { usePastBlocks: false }],
    ] as const)(
      'after a block number is cached if the block tracker was %s',
      (_description, blockTrackerOptions) => {
        it('should return the fetched block number if the fetched block number is greater than the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const blockNumber1 = await blockTracker.checkForLatestBlock();
              expect(blockNumber1).toBe('0x0');
              const blockNumber2 = await blockTracker.checkForLatestBlock();
              expect(blockNumber2).toBe('0x1');
            },
          );
        });

        it('should update the current block number if the fetched block number is greater than the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              await blockTracker.checkForLatestBlock();
              await blockTracker.checkForLatestBlock();
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x1');
            },
          );
        });

        it('should return the current block number if the fetched block number is less than the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const blockNumber1 = await blockTracker.checkForLatestBlock();
              expect(blockNumber1).toBe('0x1');
              const blockNumber2 = await blockTracker.checkForLatestBlock();
              expect(blockNumber2).toBe('0x1');
            },
          );
        });

        it('should not update the current block number if the fetched block number is less than the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              await blockTracker.checkForLatestBlock();
              await blockTracker.checkForLatestBlock();
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x1');
            },
          );
        });
      },
    );

    describe('after a block number is cached if the block tracker was initialized with `usePastBlocks: true`', () => {
      it('should return the fetched block number if the fetched block number is greater than the current block number', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
              ],
            },
            blockTracker: { usePastBlocks: true },
          },
          async ({ blockTracker }) => {
            const blockNumber1 = await blockTracker.checkForLatestBlock();
            expect(blockNumber1).toBe('0x0');
            const blockNumber2 = await blockTracker.checkForLatestBlock();
            expect(blockNumber2).toBe('0x1');
          },
        );
      });

      it('should update the current block number if the fetched block number is greater than the current block number', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
              ],
            },
            blockTracker: { usePastBlocks: true },
          },
          async ({ blockTracker }) => {
            await blockTracker.checkForLatestBlock();
            await blockTracker.checkForLatestBlock();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toBe('0x1');
          },
        );
      });

      it('should return the fetched block number if the fetched block number is less than the current block number', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
            blockTracker: { usePastBlocks: true },
          },
          async ({ blockTracker }) => {
            const blockNumber1 = await blockTracker.checkForLatestBlock();
            expect(blockNumber1).toBe('0x1');
            const blockNumber2 = await blockTracker.checkForLatestBlock();
            expect(blockNumber2).toBe('0x0');
          },
        );
      });

      it('should update the current block number if the fetched block number is less than the current block number', async () => {
        recordCallsToSetTimeout();

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
            blockTracker: { usePastBlocks: true },
          },
          async ({ blockTracker }) => {
            await blockTracker.checkForLatestBlock();
            await blockTracker.checkForLatestBlock();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toBe('0x0');
          },
        );
      });
    });
  });

  METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
    describe(`${methodToAddListener}`, () => {
      describe('"latest"', () => {
        it('should start the block tracker', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(({ blockTracker }) => {
            blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);

            expect(blockTracker.isRunning()).toBe(true);
          });
        });

        it('should emit "latest" soon afterward', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const latestBlockNumber = await new Promise<string>((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });
              expect(latestBlockNumber).toBe('0x0');
            },
          );
        });

        it('should update the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x0');
            },
          );
        });

        it('should not continuing polling if started and then stopped while waiting for the next iteration', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            blockResetDuration: 123,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              await jest.runOnlyPendingTimersAsync();
              blockTracker.removeListener('latest', EMPTY_FUNCTION);
              await setTimeoutRecorder.next();
              expect(setTimeoutRecorder.calls).toHaveLength(0);
            },
          );
        });

        it('should not continuing polling if rapidly started and stopped', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            blockResetDuration: 123,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              blockTracker.removeListener('latest', EMPTY_FUNCTION);
              await jest.runOnlyPendingTimersAsync();
              expect(setTimeoutRecorder.calls).toHaveLength(0);
            },
          );
        });

        it('should not allow concurrent polling loops if rapidly started, stopped, and started again', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              blockTracker.removeListener('latest', EMPTY_FUNCTION);
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              await jest.runOnlyPendingTimersAsync();
              expect(setTimeoutRecorder.calls).toHaveLength(1);
            },
          );
        });

        it('should not prevent Node from exiting when the poll loop is stopped while waiting for the next iteration', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
            keepEventLoopActive: false,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);

              await new Promise((resolve) => {
                blockTracker.on('_waitingForNextIteration', resolve);
              });

              const nextIterationTimeout = setTimeoutRecorder.calls.find(
                (call) => {
                  return call.duration === blockTrackerOptions.pollingInterval;
                },
              );
              expect(nextIterationTimeout).toBeDefined();
              expect(nextIterationTimeout?.timeout.hasRef()).toBe(false);
            },
          );
        });

        it('should re-throw any error out of band that occurs in the listener', async () => {
          await withPollingBlockTracker(async ({ blockTracker }) => {
            const thrownError = new Error('boom');
            const promiseForCaughtError = new Promise<unknown>((resolve) => {
              recordCallsToSetTimeout({
                numAutomaticCalls: 2,
                interceptCallback: (callback, stopPassingThroughCalls) => {
                  return async () => {
                    try {
                      await callback();
                    } catch (error: unknown) {
                      resolve(error);
                      stopPassingThroughCalls();
                    }
                  };
                },
              });
            });

            blockTracker[methodToAddListener]('latest', () => {
              throw thrownError;
            });

            const caughtError = await promiseForCaughtError;
            expect(caughtError).toBe(thrownError);
          });
        });

        it('should cause the request for the latest block to be made with `skipCache: true` if the block tracker was initialized with setSkipCacheFlag: true', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            { blockTracker: { setSkipCacheFlag: true } },
            async ({ provider, blockTracker }) => {
              jest.spyOn(provider, 'request');

              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              expect(provider.request).toHaveBeenCalledWith({
                jsonrpc: '2.0' as const,
                id: expect.any(Number),
                method: 'eth_blockNumber' as const,
                params: [],
                skipCache: true,
              });
            },
          );
        });

        it(`should emit the "error" event and should not kill the block tracker if, while making the request for the latest block number, the provider throws`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const latestBlock = await promiseForLatestBlock;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(latestBlock).toBe('0x0');
            },
          );
        });

        it(`should emit the "error" event and should not kill the block tracker if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: thrownError,
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const latestBlock = await promiseForLatestBlock;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(latestBlock).toBe('0x0');
            },
          );
        });

        it('should log an error if, while making a request for the latest block number, the provider throws and there is nothing listening to "error"', async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              await new Promise((resolve) => {
                blockTracker.on('_waitingForNextIteration', resolve);
              });

              expect(console.error).toHaveBeenCalledWith(
                'Error updating latest block: boom',
              );
            },
          );
        });

        it('should log an error if, while making the request for the latest block number, the provider rejects with an error and there is nothing listening to "error"', async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: thrownError,
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

              blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);
              await new Promise((resolve) => {
                blockTracker.on('_waitingForNextIteration', resolve);
              });

              expect(console.error).toHaveBeenCalledWith(
                'Error updating latest block: boom',
              );
            },
          );
        });

        describe.each([
          ['not initialized with `usePastBlocks`', {}],
          ['initialized with `usePastBlocks: false`', { usePastBlocks: false }],
        ] as const)(
          'after a block number is cached if the block tracker was %s',
          (_description, blockTrackerOptions) => {
            it('should emit "latest" if the fetched block number is greater than the current block number', async () => {
              const setTimeoutRecorder = recordCallsToSetTimeout({
                numAutomaticCalls: 1,
              });

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x1',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
                },
                async ({ blockTracker }) => {
                  const receivedBlockNumbers: string[] = [];

                  await new Promise<void>((resolve) => {
                    setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                    blockTracker[methodToAddListener](
                      'latest',
                      (blockNumber: string) => {
                        receivedBlockNumbers.push(blockNumber);
                      },
                    );
                  });

                  expect(receivedBlockNumbers).toStrictEqual(['0x0', '0x1']);
                },
              );
            });

            it('should not emit "latest" if the fetched block number is less than the current block number', async () => {
              const setTimeoutRecorder = recordCallsToSetTimeout({
                numAutomaticCalls: 1,
              });

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x1',
                      },
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
                },
                async ({ blockTracker }) => {
                  const receivedBlockNumbers: string[] = [];

                  await new Promise<void>((resolve) => {
                    setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                    blockTracker[methodToAddListener](
                      'latest',
                      (blockNumber: string) => {
                        receivedBlockNumbers.push(blockNumber);
                      },
                    );
                  });

                  expect(receivedBlockNumbers).toStrictEqual(['0x1']);
                },
              );
            });

            it('should not emit "latest" if the fetched block number is the same as the current block number', async () => {
              const setTimeoutRecorder = recordCallsToSetTimeout({
                numAutomaticCalls: 1,
              });

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
                },
                async ({ blockTracker }) => {
                  const receivedBlockNumbers: string[] = [];

                  await new Promise<void>((resolve) => {
                    setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                    blockTracker[methodToAddListener](
                      'latest',
                      (blockNumber: string) => {
                        receivedBlockNumbers.push(blockNumber);
                      },
                    );
                  });

                  expect(receivedBlockNumbers).toStrictEqual(['0x0']);
                },
              );
            });
          },
        );

        describe('after a block number is cached if the block tracker was initialized with `usePastBlocks: true`', () => {
          it('should emit "latest" if the fetched block number is greater than the current block number', async () => {
            const setTimeoutRecorder = recordCallsToSetTimeout({
              numAutomaticCalls: 1,
            });

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
              },
              async ({ blockTracker }) => {
                const receivedBlockNumbers: string[] = [];

                await new Promise<void>((resolve) => {
                  setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                  blockTracker[methodToAddListener](
                    'latest',
                    (blockNumber: string) => {
                      receivedBlockNumbers.push(blockNumber);
                    },
                  );
                });

                expect(receivedBlockNumbers).toStrictEqual(['0x0', '0x1']);
              },
            );
          });

          it('should emit "latest" if the fetched block number is less than the current block number', async () => {
            const setTimeoutRecorder = recordCallsToSetTimeout({
              numAutomaticCalls: 1,
            });

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
              },
              async ({ blockTracker }) => {
                const receivedBlockNumbers: string[] = [];

                await new Promise<void>((resolve) => {
                  setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                  blockTracker[methodToAddListener](
                    'latest',
                    (blockNumber: string) => {
                      receivedBlockNumbers.push(blockNumber);
                    },
                  );
                });

                expect(receivedBlockNumbers).toStrictEqual(['0x1', '0x0']);
              },
            );
          });

          it('should not emit "latest" if the fetched block number is the same as the current block number', async () => {
            const setTimeoutRecorder = recordCallsToSetTimeout({
              numAutomaticCalls: 1,
            });

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
              },
              async ({ blockTracker }) => {
                const receivedBlockNumbers: string[] = [];

                await new Promise<void>((resolve) => {
                  setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                  blockTracker[methodToAddListener](
                    'latest',
                    (blockNumber: string) => {
                      receivedBlockNumbers.push(blockNumber);
                    },
                  );
                });

                expect(receivedBlockNumbers).toStrictEqual(['0x0']);
              },
            );
          });
        });
      });

      describe('"sync"', () => {
        it('should start the block tracker', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(({ blockTracker }) => {
            blockTracker[methodToAddListener]('sync', EMPTY_FUNCTION);

            expect(blockTracker.isRunning()).toBe(true);
          });
        });

        it('should emit "sync" soon afterward', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const sync = await new Promise<Sync>((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });

        it('should update the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x0');
            },
          );
        });

        it('should not prevent Node from exiting when the poll loop is stopped while waiting for the next iteration', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
            keepEventLoopActive: false,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener]('sync', EMPTY_FUNCTION);

              await new Promise((resolve) => {
                blockTracker.on('_waitingForNextIteration', resolve);
              });

              const nextIterationTimeout = setTimeoutRecorder.calls.find(
                (call) => {
                  return call.duration === blockTrackerOptions.pollingInterval;
                },
              );
              expect(nextIterationTimeout).toBeDefined();
              expect(nextIterationTimeout?.timeout.hasRef()).toBe(false);
            },
          );
        });

        it('should re-throw any error out of band that occurs in the listener', async () => {
          await withPollingBlockTracker(async ({ blockTracker }) => {
            const thrownError = new Error('boom');
            const promiseForCaughtError = new Promise<unknown>((resolve) => {
              recordCallsToSetTimeout({
                numAutomaticCalls: 2,
                interceptCallback: (callback, stopPassingThroughCalls) => {
                  return async () => {
                    try {
                      await callback();
                    } catch (error: unknown) {
                      resolve(error);
                      stopPassingThroughCalls();
                    }
                  };
                },
              });
            });

            blockTracker[methodToAddListener]('sync', () => {
              throw thrownError;
            });

            const caughtError = await promiseForCaughtError;
            expect(caughtError).toBe(thrownError);
          });
        });

        it('should cause the request for the latest block to be made with `skipCache: true` if the block tracker was initialized with setSkipCacheFlag: true', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            { blockTracker: { setSkipCacheFlag: true } },
            async ({ provider, blockTracker }) => {
              jest.spyOn(provider, 'request');

              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              expect(provider.request).toHaveBeenCalledWith({
                jsonrpc: '2.0' as const,
                id: expect.any(Number),
                method: 'eth_blockNumber' as const,
                params: [],
                skipCache: true,
              });
            },
          );
        });

        it(`should emit the "error" event and should not kill the block tracker if, while making the request for the latest block number, the provider throws`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const sync = await promiseForSync;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });

        it(`should emit the "error" event and should not kill the block tracker if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: new Error('boom'),
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const sync = await promiseForSync;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });

        it('should log an error if, while making a request for the latest block number, the provider throws and there is nothing listening to "error"', async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

              blockTracker[methodToAddListener]('sync', EMPTY_FUNCTION);
              await new Promise((resolve) => {
                blockTracker.on('_waitingForNextIteration', resolve);
              });

              expect(console.error).toHaveBeenCalledWith(
                'Error updating latest block: boom',
              );
            },
          );
        });

        it('should log an error if, while making the request for the latest block number, the provider rejects with an error and there is nothing listening to "error"', async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: thrownError,
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

              blockTracker[methodToAddListener]('sync', EMPTY_FUNCTION);
              await new Promise((resolve) => {
                blockTracker.on('_waitingForNextIteration', resolve);
              });

              expect(console.error).toHaveBeenCalledWith(
                'Error updating latest block: boom',
              );
            },
          );
        });

        describe.each([
          ['not initialized with `usePastBlocks`', {}],
          ['initialized with `usePastBlocks: false`', { usePastBlocks: false }],
        ] as const)(
          'after a block number is cached if the block tracker was %s',
          (_description, blockTrackerOptions) => {
            it('should emit "sync" if the fetched block number is greater than the current block number', async () => {
              const setTimeoutRecorder = recordCallsToSetTimeout({
                numAutomaticCalls: 1,
              });

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x1',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
                },
                async ({ blockTracker }) => {
                  const syncs: Sync[] = [];

                  await new Promise<void>((resolve) => {
                    setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                    blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                      syncs.push(sync);
                    });
                  });

                  expect(syncs).toStrictEqual([
                    { oldBlock: null, newBlock: '0x0' },
                    { oldBlock: '0x0', newBlock: '0x1' },
                  ]);
                },
              );
            });

            it('should not emit "sync" if the fetched block number is less than the current block number', async () => {
              const setTimeoutRecorder = recordCallsToSetTimeout({
                numAutomaticCalls: 1,
              });

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x1',
                      },
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
                },
                async ({ blockTracker }) => {
                  const syncs: Sync[] = [];

                  await new Promise<void>((resolve) => {
                    setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                    blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                      syncs.push(sync);
                    });
                  });

                  expect(syncs).toStrictEqual([
                    { oldBlock: null, newBlock: '0x1' },
                  ]);
                },
              );
            });

            it('should not emit "sync" if the fetched block number is the same as the current block number', async () => {
              const setTimeoutRecorder = recordCallsToSetTimeout({
                numAutomaticCalls: 1,
              });

              await withPollingBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
                },
                async ({ blockTracker }) => {
                  const syncs: Sync[] = [];

                  await new Promise<void>((resolve) => {
                    setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                    blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                      syncs.push(sync);
                    });
                  });

                  expect(syncs).toStrictEqual([
                    { oldBlock: null, newBlock: '0x0' },
                  ]);
                },
              );
            });
          },
        );

        describe('after a block number is cached if the block tracker was initialized with `usePastBlocks: true`', () => {
          it('should emit "sync" if the fetched block number is greater than the current block number', async () => {
            const setTimeoutRecorder = recordCallsToSetTimeout({
              numAutomaticCalls: 1,
            });

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
              },
              async ({ blockTracker }) => {
                const syncs: Sync[] = [];

                await new Promise<void>((resolve) => {
                  setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                  blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                    syncs.push(sync);
                  });
                });

                expect(syncs).toStrictEqual([
                  { oldBlock: null, newBlock: '0x0' },
                  { oldBlock: '0x0', newBlock: '0x1' },
                ]);
              },
            );
          });

          it('should emit "sync" if the fetched block number is less than the current block number', async () => {
            const setTimeoutRecorder = recordCallsToSetTimeout({
              numAutomaticCalls: 1,
            });

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
              },
              async ({ blockTracker }) => {
                const syncs: Sync[] = [];

                await new Promise<void>((resolve) => {
                  setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                  blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                    syncs.push(sync);
                  });
                });

                expect(syncs).toStrictEqual([
                  { oldBlock: null, newBlock: '0x1' },
                  { oldBlock: '0x1', newBlock: '0x0' },
                ]);
              },
            );
          });

          it('should not emit "sync" if the fetched block number is the same as the current block number', async () => {
            const setTimeoutRecorder = recordCallsToSetTimeout({
              numAutomaticCalls: 1,
            });

            await withPollingBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
              },
              async ({ blockTracker }) => {
                const syncs: Sync[] = [];

                await new Promise<void>((resolve) => {
                  setTimeoutRecorder.onNumAutomaticCallsExhausted(resolve);

                  blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                    syncs.push(sync);
                  });
                });

                expect(syncs).toStrictEqual([
                  { oldBlock: null, newBlock: '0x0' },
                ]);
              },
            );
          });
        });
      });

      describe('some other event', () => {
        it('should not start the block tracker', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(({ blockTracker }) => {
            blockTracker[methodToAddListener]('somethingElse', EMPTY_FUNCTION);

            expect(blockTracker.isRunning()).toBe(false);
          });
        });

        it('should not update the current block number', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener](
                'somethingElse',
                EMPTY_FUNCTION,
              );
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBeNull();
            },
          );
        });
      });
    });
  });

  METHODS_TO_REMOVE_LISTENER.forEach((methodToRemoveListener) => {
    describe(`${methodToRemoveListener}`, () => {
      describe('"latest"', () => {
        it('should stop the block tracker if the last instance of this event is removed', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(async ({ blockTracker }) => {
            const listener1 = EMPTY_FUNCTION;
            const { promise: promiseForLatestBlock, resolve: listener2 } =
              buildDeferred();

            blockTracker.on('latest', listener1);
            blockTracker.on('latest', listener2);
            expect(blockTracker.isRunning()).toBe(true);

            await promiseForLatestBlock;

            blockTracker[methodToRemoveListener]('latest', listener1);
            blockTracker[methodToRemoveListener]('latest', listener2);
            expect(blockTracker.isRunning()).toBe(false);
          });
        });

        it('should clear the current block number some time after the last instance of this event is removed', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const listener1 = EMPTY_FUNCTION;
              const { promise: promiseForLatestBlock, resolve: listener2 } =
                buildDeferred();

              blockTracker.on('latest', listener1);
              blockTracker.on('latest', listener2);
              await promiseForLatestBlock;
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x0');

              blockTracker[methodToRemoveListener]('latest', listener1);
              blockTracker[methodToRemoveListener]('latest', listener2);
              await setTimeoutRecorder.next();
              expect(blockTracker.getCurrentBlock()).toBeNull();
            },
          );
        });

        it('should cancel polling timeout and prevent multiple synchronize loops', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();

          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x1',
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x2',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const listener = EMPTY_FUNCTION;

              for (let i = 0; i < 3; i++) {
                blockTracker.on('latest', listener);

                expect(blockTracker.isRunning()).toBe(true);

                blockTracker[methodToRemoveListener]('latest', listener);

                expect(blockTracker.isRunning()).toBe(false);
              }

              expect(setTimeoutRecorder.calls).toHaveLength(0);
            },
          );
        });
      });

      describe('"sync"', () => {
        it('should stop the block tracker if the last instance of this event is removed', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(async ({ blockTracker }) => {
            const listener1 = EMPTY_FUNCTION;
            const { promise: promiseForLatestBlock, resolve: listener2 } =
              buildDeferred();

            blockTracker.on('sync', listener1);
            blockTracker.on('sync', listener2);
            expect(blockTracker.isRunning()).toBe(true);

            await promiseForLatestBlock;

            blockTracker[methodToRemoveListener]('sync', listener1);
            blockTracker[methodToRemoveListener]('sync', listener2);
            expect(blockTracker.isRunning()).toBe(false);
          });
        });

        it('should clear the current block number some time after the last instance of this event is removed', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
          };

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const listener1 = EMPTY_FUNCTION;
              const { promise: promiseForLatestBlock, resolve: listener2 } =
                buildDeferred();

              blockTracker.on('sync', listener1);
              blockTracker.on('sync', listener2);
              await promiseForLatestBlock;
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x0');

              blockTracker[methodToRemoveListener]('sync', listener1);
              blockTracker[methodToRemoveListener]('sync', listener2);
              await setTimeoutRecorder.next();
              expect(blockTracker.getCurrentBlock()).toBeNull();
            },
          );
        });
      });

      describe('some other event', () => {
        it('should not stop the block tracker', async () => {
          recordCallsToSetTimeout();

          await withPollingBlockTracker(async ({ blockTracker }) => {
            const { promise: promiseForLatestBlock, resolve: listener1 } =
              buildDeferred();
            const listener2 = EMPTY_FUNCTION;

            blockTracker.on('latest', listener1);
            blockTracker.on('somethingElse', listener2);
            expect(blockTracker.isRunning()).toBe(true);

            await promiseForLatestBlock;

            blockTracker[methodToRemoveListener]('somethingElse', listener2);
            expect(blockTracker.isRunning()).toBe(true);
          });
        });
      });
    });
  });

  describe('once', () => {
    describe('"latest"', () => {
      it('should start and then stop the block tracker automatically', async () => {
        // We stub 2 calls because PollingBlockTracker#_synchronize will make a
        // call (to proceed to the next iteration) and BaseBlockTracker will
        // make a call (to reset the current block number when the tracker is
        // not running)
        recordCallsToSetTimeout({ numAutomaticCalls: 2 });

        await withPollingBlockTracker(async ({ blockTracker }) => {
          await new Promise((resolve) => {
            blockTracker.on('_ended', resolve);
            blockTracker.once('latest', EMPTY_FUNCTION);
          });

          expect(blockTracker.isRunning()).toBe(false);
        });
      });

      it('should not prevent Node from exiting when the poll loop is stopped while waiting for the next iteration', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
          keepEventLoopActive: false,
        };

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            const { promise, resolve: listener } = buildDeferred();

            blockTracker.once('latest', listener);

            await promise;

            // Once the listener has fired the block tracker should stop,
            // meaning there should be no timeouts.
            expect(
              setTimeoutRecorder.findCallsMatchingDuration(
                blockTrackerOptions.pollingInterval,
              ),
            ).toHaveLength(0);
          },
        );
      });

      it('should set the current block number and then clear it some time afterward', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await new Promise((resolve) => {
              blockTracker.once('latest', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toBe('0x0');

            await setTimeoutRecorder.next();
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not throw if, while making the request for the latest block number, the provider throws`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const latestBlock = await promiseForLatestBlock;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(latestBlock).toBe('0x0');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not throw if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: thrownError,
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const latestBlock = await promiseForLatestBlock;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(latestBlock).toBe('0x0');
            },
          );
        });
      });

      it('should log an error if, while making a request for the latest block number, the provider throws and there is nothing listening to "error"', async () => {
        const thrownError = new Error('boom');
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  implementation: () => {
                    throw thrownError;
                  },
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

            blockTracker.once('latest', EMPTY_FUNCTION);
            await new Promise((resolve) => {
              blockTracker.on('_waitingForNextIteration', resolve);
            });

            expect(console.error).toHaveBeenCalledWith(
              'Error updating latest block: boom',
            );
          },
        );
      });

      it('should log an error if, while making the request for the latest block number, the provider rejects with an error and there is nothing listening to "error"', async () => {
        const thrownError = new Error('boom');
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  error: thrownError,
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

            blockTracker.once('latest', EMPTY_FUNCTION);
            await new Promise((resolve) => {
              blockTracker.on('_waitingForNextIteration', resolve);
            });

            expect(console.error).toHaveBeenCalledWith(
              'Error updating latest block: boom',
            );
          },
        );
      });
    });

    describe('"sync"', () => {
      it('should start and then stop the block tracker automatically', async () => {
        // We stub 2 calls because PollingBlockTracker#_synchronize will make a call
        // (to proceed to the next iteration) and BaseBlockTracker will make a call
        // (to reset the current block number when the tracker is not running)
        recordCallsToSetTimeout({ numAutomaticCalls: 2 });

        await withPollingBlockTracker(async ({ blockTracker }) => {
          await new Promise((resolve) => {
            blockTracker.on('_ended', resolve);
            blockTracker.once('sync', EMPTY_FUNCTION);
          });

          expect(blockTracker.isRunning()).toBe(false);
        });
      });

      it('should set the current block number and then clear it some time afterward', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await new Promise((resolve) => {
              blockTracker.once('sync', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toBe('0x0');

            await setTimeoutRecorder.next();
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not throw if, while making the request for the latest block number, the provider throws`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const sync = await promiseForSync;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not throw if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          const thrownError = new Error('boom');
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withPollingBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: thrownError,
                  },
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const errorListener = jest.fn();
              blockTracker[methodToAddListener]('error', errorListener);

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const sync = await promiseForSync;
              expect(errorListener).toHaveBeenCalledWith(thrownError);
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });
      });

      it('should log an error if, while making a request for the latest block number, the provider throws and there is nothing listening to "error"', async () => {
        const thrownError = new Error('boom');
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  implementation: () => {
                    throw thrownError;
                  },
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

            blockTracker.once('sync', EMPTY_FUNCTION);
            await new Promise((resolve) => {
              blockTracker.on('_waitingForNextIteration', resolve);
            });

            expect(console.error).toHaveBeenCalledWith(
              'Error updating latest block: boom',
            );
          },
        );
      });

      it('should log an error if, while making the request for the latest block number, the provider rejects with an error and there is nothing listening to "error"', async () => {
        const thrownError = new Error('boom');
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  error: thrownError,
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            jest.spyOn(console, 'error').mockImplementation(EMPTY_FUNCTION);

            blockTracker.once('sync', EMPTY_FUNCTION);
            await new Promise((resolve) => {
              blockTracker.on('_waitingForNextIteration', resolve);
            });

            expect(console.error).toHaveBeenCalledWith(
              'Error updating latest block: boom',
            );
          },
        );
      });
    });

    describe('some other event', () => {
      it('should never start the block tracker', async () => {
        // We stub 2 calls because PollingBlockTracker#_synchronize will make a call
        // (to proceed to the next iteration) and BaseBlockTracker will make a call
        // (to reset the current block number when the tracker is not running)
        recordCallsToSetTimeout({ numAutomaticCalls: 2 });

        await withPollingBlockTracker(async ({ blockTracker }) => {
          const listener = jest.fn();
          blockTracker.on('_ended', listener);
          blockTracker.once('somethingElse', EMPTY_FUNCTION);

          expect(listener).not.toHaveBeenCalled();
        });
      });

      it('should never set the current block number', async () => {
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withPollingBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            blockTracker.once('somethingElse', EMPTY_FUNCTION);
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });
    });
  });

  describe('removeAllListeners', () => {
    it('should stop the block tracker if any "latest" and "sync" events were added previously', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(async ({ blockTracker }) => {
        blockTracker.on('latest', EMPTY_FUNCTION);
        await new Promise((resolve) => {
          blockTracker.on('sync', resolve);
        });
        expect(blockTracker.isRunning()).toBe(true);

        blockTracker.removeAllListeners();
        expect(blockTracker.isRunning()).toBe(false);
      });
    });

    it('should clear the current block number some time after all "latest" and "sync" events are removed', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();
      const blockTrackerOptions = {
        pollingInterval: 100,
        blockResetDuration: 200,
      };

      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
          blockTracker: blockTrackerOptions,
        },
        async ({ blockTracker }) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          await new Promise((resolve) => {
            blockTracker.on('sync', resolve);
          });
          expect(blockTracker.getCurrentBlock()).toBe('0x0');

          blockTracker.removeAllListeners();
          await setTimeoutRecorder.next();
          expect(blockTracker.getCurrentBlock()).toBeNull();
        },
      );
    });

    it('should stop the block tracker when all previously added "latest" and "sync" events are removed specifically', async () => {
      recordCallsToSetTimeout();

      await withPollingBlockTracker(async ({ blockTracker }) => {
        await new Promise<void>((resolve) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          blockTracker.on('sync', resolve);
        });
        expect(blockTracker.isRunning()).toBe(true);

        blockTracker.removeAllListeners('latest');
        expect(blockTracker.isRunning()).toBe(true);

        blockTracker.removeAllListeners('sync');
        expect(blockTracker.isRunning()).toBe(false);
      });
    });

    it('should clear the current block number some time after all "latest" and "sync" events are removed specifically', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();
      const blockTrackerOptions = {
        pollingInterval: 100,
        blockResetDuration: 200,
      };

      await withPollingBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
          blockTracker: blockTrackerOptions,
        },
        async ({ blockTracker }) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          await new Promise((resolve) => {
            blockTracker.on('sync', resolve);
          });
          expect(blockTracker.getCurrentBlock()).toBe('0x0');

          blockTracker.removeAllListeners('latest');
          blockTracker.removeAllListeners('sync');
          await setTimeoutRecorder.next();
          expect(blockTracker.getCurrentBlock()).toBeNull();
        },
      );
    });
  });
});
