interface BlockNumberCachedOption<T> {
  description: string;
  result: T;
}

interface BlockNumberCachedOptions<T> {
  gt: BlockNumberCachedOption<T>;
  lt: BlockNumberCachedOption<T>;
  eq: BlockNumberCachedOption<T>;
}

interface BlockNumberCachedScenario<T> {
  description: string;
  result: T;
  scenario: string;
  blockNumbers: string[];
}

/**
 * Builds arguments to use in loops that cover test
 * cases where an existing block number in cache and a new
 * block number number is being processed.
 *
 * @param options - The options.
 * @param options.gt - The option for the 'greater than' scenario.
 * @param options.lt - The option for the 'less than' scenario.
 * @param options.eq - The option for the 'equal to' scenario.
 * @returns Array of objects to be used in test loops.
 */
export const buildBlockNumberCachedScenarios = <T>(
  options: BlockNumberCachedOptions<T>,
): BlockNumberCachedScenario<T>[] => {
  return [
    {
      ...options.gt,
      scenario:
        'the received block number is greater than the current block number',
      blockNumbers: ['0x0', '0x1'],
    },
    {
      ...options.lt,
      scenario:
        'the received block number is less than the current block number',
      blockNumbers: ['0x1', '0x0'],
    },
    {
      ...options.eq,
      scenario:
        'the received block number is equal to the current block number',
      blockNumbers: ['0x0', '0x0'],
    },
  ];
};
