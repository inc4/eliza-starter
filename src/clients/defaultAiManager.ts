import {Client, elizaLogger, IAgentRuntime, Content, Memory, Media, ModelClass, composeContext, stringToUuid, generateMessageResponse, messageCompletionFooter } from "@elizaos/core";
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

export class AiManager {
    runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
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

export const AiClientInterface: Client = {
    async start(runtime: IAgentRuntime) {

        elizaLogger.log("Default Ai client started");

        const manager = new AiManager(runtime);

        return manager;
    },

    async stop(_runtime: IAgentRuntime) {
        elizaLogger.warn("Twitter client does not support stopping yet");
    },
};
