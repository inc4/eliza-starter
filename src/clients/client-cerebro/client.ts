import { elizaLogger, type IAgentRuntime } from "@elizaos/core";
import { CerebroClient } from "./cerebroClient.ts";
import { type CerebroConfig, validateCerebroConfig} from "./environment.ts";

export const CerebroClientInterface = {
    start: async (runtime: IAgentRuntime) => {
        let config: CerebroConfig = await validateCerebroConfig(runtime);

        const client = new CerebroClient(
            runtime,
            config,
        );

        await client.start();

        elizaLogger.success(
            `✅ Cerebro client successfully started for character ${runtime.character.name}`
        );
        return client;
    },
};
