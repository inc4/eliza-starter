import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { Character, IAgentRuntime } from "@elizaos/core";
import { TwitterClientInterface, TwitterManager } from "./client-twitter/src/index.ts";

import { AdminClient } from "./client-admin/src/index.ts";

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime,
  adminClient: AdminClient,
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

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

    adminClient.registerTwitter(runtime.agentId, twitterManager as TwitterManager) // add here twitter manager
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
