# `character.json` File Documentation (elizaOS/eliza-starter)

## Overview
The `character.json` file in the `elizaOS/eliza-starter` repository defines the configuration for an autonomous AI agent (an "Eliza") within the ElizaOS framework. This file specifies the agent's identity, personality, capabilities, and integration settings, enabling it to operate on platforms like Twitter, Discord, or Telegram. In the `eliza-starter` context, it serves as the primary configuration for a quick-start agent, allowing users to customize and deploy their own Eliza instance.

## File Location
- Stored in the `characters` directory within the `eliza-starter` repository: `/characters/<agent-name>/character.json`.
- Example: `/characters/default-agent/character.json`.
- The `characters` folder supports multiple agent configurations, each in its own subdirectory.

## Structure
The file is a JSON-formatted configuration with sections for identity, behavior, and technical settings. Below is an example based on the `eliza-starter` conventions, reflecting its use in the repository.

### Example `character.json`
```json
{
  "name": "DefaultAgent",
  "modelProvider": "openai",
  "clients": ["twitter", "discord"],
  "plugins": [],
  "settings": {
    "ragKnowledge": false,
    "secrets": {
      "OPENAI_API_KEY": "sk-xxxxx"
    },
    "voice": {},
    "model": "gpt-4",
    "modelConfig": {
      "maxInputTokens": 4000,
      "maxOutputTokens": 1000
    }
  },
  "bio": [
    "I am a helpful AI assistant created to explore the digital world.",
    "My purpose is to assist and inform users across platforms."
  ],
  "lore": [
    "she once spent a month living entirely in VR, emerging with a 50-page manifesto on 'digital ontology' and blurry vision",
    "her unofficial motto is 'move fast and fix things'"
  ],
  "postExamples": [
    "ai is cool but it needs to meet a human need beyond shiny toy bullshit"
  ],
  "adjectives": [
    "funny",
    "intelligent"
  ],
  "topics": [
    "@elonmusk",
    "quantum physics",
    "philosophy"
  ],
  "style": {
    "all": ["friendly", "concise"],
    "chat": ["engaging"],
    "post": ["informative"]
  }
}
```

## Field Descriptions
### name
Type: String (required).
Description: The display name of the agent, used for identification and in conversations.
Example: "DefaultAgent"
### modelProvider
Type: String (required).
Description: Specifies the AI model provider powering the agent. Supported providers in eliza-starter include "openai", "anthropic", "groq", etc.
 Example: "openai"
### clients
Type: Array of strings (required).
Description: Lists the platforms the agent can interact with. In eliza-starter, common options are "twitter", "discord", and "direct" (for local testing).
Example: ["twitter", "discord"]
Note: Requires corresponding credentials in .env (e.g., TWITTER_USERNAME, DISCORD_API_TOKEN).
### plugins
Type: Array of strings (optional).
Description: Specifies ElizaOS plugins to extend the agent’s functionality (e.g., @elizaos/plugin-discord). In eliza-starter, this is often empty by default but can be populated with available plugins.
Example: [] or ["solana-trading"]
### settings
Type: Object (optional).
Description: Configuration settings for the agent’s behavior and model.
##### Subfields:
1. ragKnowledge (boolean): Enables Retrieval-Augmented.  Generation (RAG) for knowledge retrieval. Defaults to false.
Example: false.
2. secrets (object): Stores sensitive API keys. In eliza-starter, these can alternatively be set in .env.
Example: {"OPENAI_API_KEY": "sk-xxxxx"}
3. voice (object): Voice configuration (currently unused in eliza-starter but reserved for future features).
Example: {}
4. model (string): Overrides the default model for the provider (e.g., "gpt-4", "claude-3").
Example: "gpt-4"
5. modelConfig (object): Fine-tunes model behavior.
6. maxInputTokens (integer): Maximum input tokens. Default varies by provider.
Example: 4000
7. maxOutputTokens (integer): Maximum output tokens.
Example: 1000
### bio
Type: Array of strings or single string (optional).
Description: The agent’s backstory or purpose, used to shape its responses and personality.
Example: ["I am a helpful AI assistant created to explore the digital world."]
### lore
Type: Array of strings.
Description: Describe the character's world, history, and important events that shaped them. Write one complete sentence per line.
Example: ["her unofficial motto is 'move fast and fix things"]
### postExamples
Type: Array of strings.
### adjectives
Type: Array of strings.
### topics
Type: Array of strings.
### style
Type: Object (optional).
Description: Defines the agent’s interaction style across different contexts.
#### Subfields:
1. all (array of strings): General style rules applied universally.
Example: ["friendly", "concise"].
1. chat (array of strings): Style for chat interactions.  Example: ["engaging"].
2. post (array of strings): Style for posts (e.g., tweets).
  Example: ["informative"]
### templates
1. twitterPostTemplate
2. goalsTemplate
3. factsTemplate
4. messageHandlerTemplate
5. shouldRespondTemplate
6. continueMessageHandlerTemplate
7. evaluationTemplate
8. twitterSearchTemplate
9. twitterActionTemplate
10. twitterMessageHandlerTemplate
11. twitterShouldRespondTemplate
12. farcasterPostTemplate
13. lensPostTemplate
14. farcasterMessageHandlerTemplate
15. lensMessageHandlerTemplate
16. farcasterShouldRespondTemplate
17. lensShouldRespondTemplate
18. telegramMessageHandlerTemplate
19. telegramShouldRespondTemplate
20. discordVoiceHandlerTemplate
21. discordShouldRespondTemplate
22. discordMessageHandlerTemplate
23. slackMessageHandlerTemplate
24. slackShouldRespondTemplate
Example:
```
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should be 1, 2, or 3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.`;
```
- knowledge
  Take 5 random strings from knowledge section in json file.
- agentName
  Take name of agant
- lore
  Take 10 random string from lore section in json file
- bio
  Take 3 random string from bio section in json file
- characterPostExamples
  Take 50 random string from lore section in json file
- topic (randomly pick one topic)
- topics
  Take 5 random string from topics section in json file
- adjective (randomly pick one adjective)
- postDirections Example of structure:
 "# Post Directions for " + characterName"
  joins all string in style.all and style.post section in json file

