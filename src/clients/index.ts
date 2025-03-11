import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { Character, IAgentRuntime } from "@elizaos/core";
import { TwitterClientInterface, TwitterManager } from "./client-twitter/src/index.ts";
import { DirectClient } from "@elizaos/client-direct";
import { validateRequest } from "./client-twitter/src/middleware.ts"
import { validatePostTweetSchema } from "./client-twitter/src/validations.ts"
import { AiManager} from './defaultAiManager.ts'


export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime,
  directClient: DirectClient,
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  const AiDefaultManager = new AiManager(runtime);

  directClient.app.post("/agents/:agentId/message", (req, res) => {
        return AiDefaultManager.generateMessage(req, res)
  });

  if (clientTypes.includes("auto")) {
    const autoClient = await AutoClientInterface.start(runtime);
    if (autoClient) clients.push(autoClient);
  }

  if (clientTypes.includes("discord")) {
    clients.push(await DiscordClientInterface.start(runtime));
  }

  if (clientTypes.includes("telegram")) {
    const telegramClient = await TelegramClientInterface.start(runtime);
    if (telegramClient) clients.push(telegramClient);
  }

  if (clientTypes.includes("twitter")) {
    const twitterManager = await TwitterClientInterface.start(runtime);
    clients.push(twitterManager);
    const manager = twitterManager as TwitterManager;
    directClient.app.post("/twitter/:agentId/tweet", validateRequest(validatePostTweetSchema), manager.postTweet.bind(manager));
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }

  return clients;
}
