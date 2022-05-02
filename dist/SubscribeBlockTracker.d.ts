import { BaseBlockTracker, Provider } from './BaseBlockTracker';
export interface SubscribeBlockTrackerOptions {
    provider?: Provider;
    blockResetDuration?: number;
}
export declare class SubscribeBlockTracker extends BaseBlockTracker {
    private _provider;
    private _subscriptionId;
    constructor(opts?: SubscribeBlockTrackerOptions);
    checkForLatestBlock(): Promise<string>;
    protected _start(): Promise<void>;
    protected _end(): Promise<void>;
    private _call;
    private _handleSubData;
}
