import {
    parseBooleanFromText,
    IAgentRuntime,
} from "@elizaos/core";
import { z, ZodError } from "zod";


/**
 * This schema defines all required/optional environment settings,
 */
export const cerebroEnvSchema = z.object({
    CEREBRO_ENABLED: z.boolean(),
    CEREBRO_BASE_URL: z.string(),
    CEREBRO_API_KEY: z.string(),
});

export type CerebroConfig = z.infer<typeof cerebroEnvSchema>;

/**
 * Validates or constructs a CerebroConfig object using zod,
 * taking values from the IAgentRuntime or process.env as needed.
 */
export async function validateCerebroConfig(
    runtime: IAgentRuntime
): Promise<CerebroConfig> {
    try {
        const cerebroConfig = {
            CEREBRO_ENABLED: parseBooleanFromText(String(runtime.getSetting("CEREBRO_ENABLED"))) ||
                parseBooleanFromText(process.env.CEREBRO_ENABLED),
            CEREBRO_BASE_URL:
                runtime.getSetting("CEREBRO_BASE_URL") ||
                process.env.CEREBRO_BASE_URL,
            CEREBRO_API_KEY:
                runtime.getSetting("CEREBRO_API_KEY") ||
                process.env.CEREBRO_API_KEY,
        };
        return cerebroEnvSchema.parse(cerebroConfig);
    } catch (error) {
        if (error instanceof ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Cerebro configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
