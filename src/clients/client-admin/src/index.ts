import express, { 
    type Request as ExpressRequest,
    type Response as ExpressResponse,
    NextFunction
} from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import {
    type AgentRuntime,
    messageCompletionFooter,
    elizaLogger,
    type IAgentRuntime,
    type Content,
    type Memory,
    type Media,
    stringToUuid,
    composeContext,
    getEmbeddingZeroVector,
    generateMessageResponse,
    ModelClass
} from "@elizaos/core"
import { DEFAULT_MAX_TWEET_LENGTH } from "../../client-twitter/src/environment.ts";
import { validatePostTweetSchema } from "./validations.ts";
import { createApiRouter } from "./api.ts";
import { string } from "zod";
import { validateRequest } from "./middleware.ts";
import { TwitterManager } from "../../client-twitter/src/index.ts";
import { ClientBase } from "../../client-twitter/src/base.ts"
import { BaseClient, range } from "discord.js";


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


export class AdminClient {
    public app: express.Application
    private agents: Map<string, AgentRuntime>; // container management
    private twitterManagers: Map<string, TwitterManager>
    private server: any; // Store server instance
    public startAgent: Function; // Store startAgent functor
    public loadCharacterTryPath: Function; // Store loadCharacterTryPath functor
    public jsonToCharacter: Function; // Store jsonToCharacter functor

    constructor() {
        elizaLogger.log("AdminClient constructor");

        this.app = express();
        this.app.use(cors());
        this.agents = new Map();
        this.twitterManagers = new Map();

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        const apiRouter = createApiRouter(this.agents, this);
        this.app.use(apiRouter);

        this.app.post("/agents/:agentId/message", this.generateMessage.bind(this));
        this.app.post("/twitter/:agentId/tweet", validateRequest(validatePostTweetSchema), this.postTweet.bind(this));
    }

    private async generateMessage(req: express.Request, res: express.Response) {
        const agentId = req.params.agentId;
        const roomId = stringToUuid("admin-room-" + agentId);
        const userId = stringToUuid("admin");

        let runtime = this.agents.get(agentId);

        // if runtime is null, look for runtime with the same name
        if (!runtime) {
            runtime = Array.from(this.agents.values()).find(
                (a) =>
                    a.character.name.toLowerCase() ===
                    agentId.toLowerCase()
            );
        }

        if (!runtime) {
            res.status(404).send("Agent not found");
            return;
        }

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
            agentId: runtime.agentId,
        };

        const memory: Memory = {
            id: stringToUuid(messageId + "-" + userId),
            ...userMessage,
            agentId: runtime.agentId,
            userId,
            roomId,
            content,
            createdAt: Date.now(),
        };
        
        let state = await runtime.composeState(userMessage, {
            agentName: runtime.character.name,
            task: req.body.task,
            instructions: req.body.instructions
        });

        const context = composeContext({
            state,
            template: messageHandlerTemplate,
        });

        const response = await generateMessageResponse({
            runtime: runtime,
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

        await runtime.evaluate(memory, state);

        res.json([response])
    }

    private async postTweet(req: express.Request, res: express.Response) {
        const agentId = req.params.agentId;

        let twitter = this.twitterManagers.get(agentId)

        if (!twitter) {
            res.status(404).send("Agent not found");
            return;
        }

        try {
            twitter.client.sendStandardTweet(req.body.content)
        } catch {
            res.status(404).send("Agent not found");
            return;
        }

        res.json([])
    }

    public unregisterAgent(runtime: AgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public registerAgent(runtime: AgentRuntime) {
        this.agents.set(runtime.agentId, runtime);
    }

    public registerTwitter(agentId: string, twitterManager: TwitterManager) {
        this.twitterManagers.set(agentId, twitterManager)
    }

    public start(port: number) {
        this.server = this.app.listen(port, () => {
            elizaLogger.success(
                `Admin REST API bound to 0.0.0.0:${port}. If running locally, access it at http://localhost:${port}.`
            );
        });

        // Handle graceful shutdown
        const gracefulShutdown = () => {
            elizaLogger.log("Received shutdown signal, closing server...");
            this.server.close(() => {
                elizaLogger.success("Server closed successfully");
                process.exit(0);
            });

            // Force close after 5 seconds if server hasn't closed
            setTimeout(() => {
                elizaLogger.error(
                    "Could not close connections in time, forcefully shutting down"
                );
                process.exit(1);
            }, 5000);
        };

        // Handle different shutdown signals
        process.on("SIGTERM", gracefulShutdown);
        process.on("SIGINT", gracefulShutdown);
    }

    public stop() {
        if (this.server) {
            this.server.close(() => {
                elizaLogger.success("Server stopped");
            });
        }
    }
}