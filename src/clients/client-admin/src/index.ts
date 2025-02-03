import express, { 
    type Request as ExpressRequest,
    type Response as ExpressResponse,
    NextFunction
} from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
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
import { createApiRouter } from "./api.ts";
import { string } from "zod";



const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), "data", "uploads");
        // Create the directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

// some people have more memory than disk.io
const upload = multer({ storage /*: multer.memoryStorage() */ });


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
    private server: any; // Store server instance
    private secret: string; // Admin secret
    public startAgent: Function; // Store startAgent functor
    public loadCharacterTryPath: Function; // Store loadCharacterTryPath functor
    public jsonToCharacter: Function; // Store jsonToCharacter functor

    constructor(secret: string) {
        elizaLogger.log("AdminClient constructor");

        this.secret = secret

        this.app = express();
        this.app.use(cors());
        this.agents = new Map();

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        const apiRouter = createApiRouter(this.agents, this);
        this.app.use(apiRouter);

        // Middleware to check for admin API key
        const adminAuth = (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
            try {
              const token = req.header('Authorization')?.split(' ')[1]; // Expecting "Bearer <token>"
          
              if (!token) {
                res.status(401).json({ message: 'Access denied. No token provided.' });
                return 
              }
          
              if (token !== this.secret) {
                res.status(401).json({ message: 'Access denied.' });
                return 
              }
          
              next();
            } catch (err) {
                res.status(400).json({ message: 'Invalid token.' });
                return 
            }
          };

        this.app.post(
            "/agents/:agentId/message",
            adminAuth,

            async (req: express.Request, res: express.Response) => {
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
        );
    }

    public unregisterAgent(runtime: AgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public registerAgent(runtime: AgentRuntime) {
        this.agents.set(runtime.agentId, runtime);
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