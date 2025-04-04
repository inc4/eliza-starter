import { type IAgentRuntime, type Client, elizaLogger } from "@elizaos/core";
import {CerebroConfig, validateCerebroConfig} from "./environment.ts";
import {PersonalizedTrendSummary, ResponseData, TrendSummary, TweetSummary} from "./type.ts";

export class CerebroClient  {
    private runtime: IAgentRuntime;
    public config: CerebroConfig;

    constructor(runtime: IAgentRuntime, config: CerebroConfig) {
        elizaLogger.log("📱 Constructing new CerebroClient...");
        this.runtime = runtime;
        this.config = config;
        elizaLogger.log("✅ CerebroClient constructor completed");
    }

    public async start(): Promise<void> {
        elizaLogger.log("🚀 Starting Cerebro client...");
    }

    public async stop(): Promise<void> {
        elizaLogger.log("Stopping Cerebro client...");
        elizaLogger.log("Cerebro client stopped");
    }

    public async getTweetSummary(): Promise<ResponseData> {
        return this._call('/tweet/summary')
    }

    public async getTrendSummary(): Promise<ResponseData> {
        return this._call('/trend/summary')
    }

    public async getPersonalizedTrendSummary(): Promise<ResponseData> {
        return this._call('/personalized-trend/summary')
    }

    private async _call(path: string): Promise<ResponseData> {
        const headers: Headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Accept', 'application/json;')
        headers.set('Authorization', 'Bearer ' + this.config.CEREBRO_API_KEY);

        const request: RequestInfo = new Request(this.config.CEREBRO_BASE_URL + path, {
            method: 'GET',
            headers: headers
        });

        return fetch(request)
            .then(res => res.json())
            .then(res => res as ResponseData)
    }
}
