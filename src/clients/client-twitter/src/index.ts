import { Client, elizaLogger, IAgentRuntime, Content, Memory, Media, ModelClass, composeContext, stringToUuid, generateMessageResponse, messageCompletionFooter } from "@elizaos/core";
import { ClientBase } from "./base.ts";
import { validateTwitterConfig, TwitterConfig } from "./environment.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { TwitterPostClient } from "./post.ts";
import { TwitterSearchClient } from "./search.ts";
import { TwitterSubscriptionClient } from "./subscription.ts";
import { Request, Response } from "express";


export const messageHandlerTemplate =
    `# Knowledge
{{knowledge}}

# Task: {{task}} for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{messageDirections}}

{{recentMessages}}

# Instructions: Write the next message for {{agentName}}. {{instructions}}
` + messageCompletionFooter;

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
export class TwitterManager {
    client: ClientBase;
    post: TwitterPostClient;
    search: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    subscription: TwitterSubscriptionClient;
    runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
        // Pass twitterConfig to the base client
        this.client = new ClientBase(runtime, twitterConfig);

        // Posting logic
        this.post = new TwitterPostClient(this.client, runtime);

        if (
            twitterConfig.TWITTER_SEARCH_ENABLE ||
            twitterConfig.TWITTER_START_USERS_SUBSCRIPTION
        ) {
            elizaLogger.warn("Twitter/X client running in a mode that:");
            elizaLogger.warn("1. violates consent of random users");
            elizaLogger.warn("2. burns your rate limit");
            elizaLogger.warn("3. can get your account banned");
            elizaLogger.warn("use at your own risk");
        }

        // Subscription logic
        if (twitterConfig.TWITTER_START_USERS_SUBSCRIPTION) {
            this.subscription = new TwitterSubscriptionClient(this.client, runtime)
        }

        // Optional search logic (enabled if TWITTER_SEARCH_ENABLE is true)
        if (twitterConfig.TWITTER_SEARCH_ENABLE) {
            this.search = new TwitterSearchClient(this.client, runtime);
        }

        // Mentions and interactions
        this.interaction = new TwitterInteractionClient(this.client, runtime);
        this.runtime = runtime;
    }

    async postTweet(req: Request, res: Response) {
        try {
            this.client.sendStandardTweet(req.body.content)
        } catch {
            res.status(404).send("Agent not found");
            return;
        }

        res.json([])
    }

    async generateMessage(req: Request, res: Response) {
        const agentId = req.params.agentId;
        const roomId = stringToUuid("admin-room-" + agentId);
        const userId = stringToUuid("admin");

        const task = req.body.task
        const instructions = req.body.instructions

        if (!task || !instructions) {
            res.status(400).send(
                "Invalid body"
            );
            return;
        }

        const messageId = stringToUuid(Date.now().toString());

        const attachments: Media[] = [];

        const content: Content = {
            text: `task: ${task}, instructions: ${instructions}`,
            attachments,
            source: "direct",
            inReplyTo: undefined,
        };

        const userMessage = {
            content,
            userId,
            roomId,
            agentId: this.runtime.agentId,
        };

        const memory: Memory = {
            id: stringToUuid(messageId + "-" + userId),
            ...userMessage,
            agentId: this.runtime.agentId,
            userId,
            roomId,
            content,
            createdAt: Date.now(),
        };
        
        let state = await this.runtime.composeState(userMessage, {
            agentName: this.runtime.character.name,
            task: req.body.task,
            instructions: req.body.instructions
        });

        const context = composeContext({
            state,
            template: messageHandlerTemplate,
        });

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        if (!response) {
            res.status(500).send(
                "No response from generateMessageResponse"
            );
            return;
        }

        // No need for action.
        response.action = undefined;

        await this.runtime.evaluate(memory, state);

        res.json([response])
    }
}

export const TwitterClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        const twitterConfig: TwitterConfig =
            await validateTwitterConfig(runtime);

        elizaLogger.log("Twitter client started");

        const manager = new TwitterManager(runtime, twitterConfig);

        // Initialize login/session
        await manager.client.init();

        // Start the posting loop
        await manager.post.start();

        // Start the subscription logic
        if (manager.subscription) {
            await manager.subscription.start()
        }

        // Start the search logic if it exists
        if (manager.search) {
            await manager.search.start();
        }

        // Start interactions (mentions, replies)
        await manager.interaction.start();

        return manager;
    },

    async stop(_runtime: IAgentRuntime) {
        elizaLogger.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;
