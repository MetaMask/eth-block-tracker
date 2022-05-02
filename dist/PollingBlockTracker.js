"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollingBlockTracker = void 0;
const json_rpc_random_id_1 = __importDefault(require("json-rpc-random-id"));
const pify_1 = __importDefault(require("pify"));
const BaseBlockTracker_1 = require("./BaseBlockTracker");
const createRandomId = (0, json_rpc_random_id_1.default)();
const sec = 1000;
class PollingBlockTracker extends BaseBlockTracker_1.BaseBlockTracker {
    constructor(opts = {}) {
        var _a;
        // parse + validate args
        if (!opts.provider) {
            throw new Error('PollingBlockTracker - no provider specified.');
        }
        super({
            blockResetDuration: (_a = opts.blockResetDuration) !== null && _a !== void 0 ? _a : opts.pollingInterval,
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
    async _start() {
        this._synchronize();
    }
    async _end() {
        // No-op
    }
    async _synchronize() {
        var _a;
        while (this._isRunning) {
            try {
                await this._updateLatestBlock();
                const promise = timeout(this._pollingInterval, !this._keepEventLoopActive);
                this.emit('_waitingForNextIteration');
                await promise;
            }
            catch (err) {
                const newErr = new Error(`PollingBlockTracker - encountered an error while attempting to update latest block:\n${(_a = err.stack) !== null && _a !== void 0 ? _a : err}`);
                try {
                    this.emit('error', newErr);
                }
                catch (emitErr) {
                    console.error(newErr);
                }
                const promise = timeout(this._retryTimeout, !this._keepEventLoopActive);
                this.emit('_waitingForNextIteration');
                await promise;
            }
        }
    }
    async _updateLatestBlock() {
        // fetch + set latest block
        const latestBlock = await this._fetchLatestBlock();
        this._newPotentialLatest(latestBlock);
    }
    async _fetchLatestBlock() {
        const req = {
            jsonrpc: '2.0',
            id: createRandomId(),
            method: 'eth_blockNumber',
            params: [],
        };
        if (this._setSkipCacheFlag) {
            req.skipCache = true;
        }
        const res = await (0, pify_1.default)((cb) => this._provider.sendAsync(req, cb))();
        if (res.error) {
            throw new Error(`PollingBlockTracker - encountered error fetching block:\n${res.error.message}`);
        }
        return res.result;
    }
}
exports.PollingBlockTracker = PollingBlockTracker;
/**
 * Waits for the specified amount of time.
 *
 * @param duration - The amount of time in milliseconds.
 * @param unref - Assuming this function is run in a Node context, governs
 * whether Node should wait before the `setTimeout` has completed before ending
 * the process (true for no, false for yes). Defaults to false.
 * @returns A promise that can be used to wait.
 */
function timeout(duration, unref) {
    return new Promise((resolve) => {
        const timeoutRef = setTimeout(resolve, duration);
        // don't keep process open
        if (timeoutRef.unref && unref) {
            timeoutRef.unref();
        }
    });
}
//# sourceMappingURL=PollingBlockTracker.js.map