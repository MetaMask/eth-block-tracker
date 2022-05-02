"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscribeBlockTracker = void 0;
const json_rpc_random_id_1 = __importDefault(require("json-rpc-random-id"));
const BaseBlockTracker_1 = require("./BaseBlockTracker");
const createRandomId = (0, json_rpc_random_id_1.default)();
class SubscribeBlockTracker extends BaseBlockTracker_1.BaseBlockTracker {
    constructor(opts = {}) {
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
    async checkForLatestBlock() {
        return await this.getLatestBlock();
    }
    async _start() {
        if (this._subscriptionId === undefined || this._subscriptionId === null) {
            try {
                const blockNumber = (await this._call('eth_blockNumber'));
                this._subscriptionId = (await this._call('eth_subscribe', 'newHeads', {}));
                this._provider.on('data', this._handleSubData.bind(this));
                this._newPotentialLatest(blockNumber);
            }
            catch (e) {
                this.emit('error', e);
            }
        }
    }
    async _end() {
        if (this._subscriptionId !== null && this._subscriptionId !== undefined) {
            try {
                await this._call('eth_unsubscribe', this._subscriptionId);
                this._subscriptionId = null;
            }
            catch (e) {
                this.emit('error', e);
            }
        }
    }
    _call(method, ...params) {
        return new Promise((resolve, reject) => {
            this._provider.sendAsync({
                id: createRandomId(),
                method,
                params,
                jsonrpc: '2.0',
            }, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res.result);
                }
            });
        });
    }
    _handleSubData(_, response) {
        var _a;
        if (response.method === 'eth_subscription' &&
            ((_a = response.params) === null || _a === void 0 ? void 0 : _a.subscription) === this._subscriptionId) {
            this._newPotentialLatest(response.params.result.number);
        }
    }
}
exports.SubscribeBlockTracker = SubscribeBlockTracker;
//# sourceMappingURL=SubscribeBlockTracker.js.map