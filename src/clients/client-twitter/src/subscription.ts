import { Profile, SearchMode } from "agent-twitter-client";
import {
    composeContext,
    generateText,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
} from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import { ClientBase } from "./base.ts";


export const twitterUserActionTemplateWithoutFooter = `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[FOLLOW] - Perfect topics match AND aligns with character (9.8/10)
[UNFOLLOW] - Most of topics was skipped according to the guidelines (9.5/10)

Last tweets:
{{lastTweets}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance. Choose exactly one action from [FOLLOW] and [UNFOLLOW]. Your response must only include the chosen action.
Choose any combination of {{actions}} that are appropriate. Each action must be on its own line. Your response must only include the chosen actions.`


interface ProfilesInfo {
    profile: Profile | string; // if string, should be a username
    following: boolean | null;
}

export class TwitterSubscriptionClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isProcessing: boolean = false;
    private lastProcessTime: number = 0;
    private stopProcessingActions: boolean = false;
    private isDryRun: boolean;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN

        // Log configuration on initialization
        elizaLogger.log("Twitter Client Configuration:");
        elizaLogger.log(`- Username: ${this.twitterUsername}`);
        elizaLogger.log(
            `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Users follow/unfollow Processing: ${this.client.twitterConfig.TWITTER_START_USERS_SUBSCRIPTION ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- User Search Processing: ${this.client.twitterConfig.TWITTER_ALLOW_SEARCH_USERS_SUBSCRIPTION ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Action Interval: ${this.client.twitterConfig.SUBSCRIPTION_ACTION_INTERVAL} minutes`
        );

        const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        if (targetUsers) {
            elizaLogger.log(`- Target Users: ${targetUsers}`);
        }

        if (this.isDryRun) {
            elizaLogger.log(
                "Twitter client initialized in dry run mode - no actual tweets should be posted"
            );
        }
    }

    async start() {
        if (!this.client.profile) {
            await this.client.init();
        }

        let nextActionShouldBeSearch = false;

        const processActionsLoop = async () => {
            const actionInterval = this.client.twitterConfig.SUBSCRIPTION_ACTION_INTERVAL;
            const profilesCheckLimit = this.client.twitterConfig.TWITTER_PROFILES_CHECK_LIMIT;

            while (!this.stopProcessingActions) {
                try {
                    const profiles: ProfilesInfo[] = [];

                    if (!nextActionShouldBeSearch) {
                        let resp = await this.client.twitterClient.fetchProfileFollowing(this.client.profile.id, 10);
                        while (profiles.length < profilesCheckLimit && resp.profiles.length > 0) {
                            profiles.push(...resp.profiles.map((profile) => ({ profile, following: true })));
                            if (profiles.length < profilesCheckLimit) {
                                if (resp.next == resp.previous) {
                                    break;
                                }
                                resp = await this.client.twitterClient.fetchProfileFollowing(this.client.profile.id, 10, resp.next);
                            }
                        }

                        const cachedTimeline = await this.client.getCachedTimeline();
                        // TODO: append other profiles to possible follows
                        const homeTimeline = await this.client.fetchHomeTimeline(cachedTimeline ? 10 : 50)

                        const homeProfiles = homeTimeline.map((tweet) => tweet.username).filter((value, index, array) => array.indexOf(value) === index);

                        profiles.push(...homeProfiles.map((profile) => ({ profile, following: false })));
                    } else {
                        const searchTerm = [...this.runtime.character.topics][
                            Math.floor(Math.random() * this.runtime.character.topics.length)
                        ];

                        console.log("Fetching search tweets");
                        // TODO: we wait 5 seconds here to avoid getting rate limited on startup, but we should queue
                        await new Promise((resolve) => setTimeout(resolve, 5000));
                        // TODO: consider to share the same search results with the post/search clients to avoid ban)
                        const recentTweets = await this.client.fetchSearchTweets(
                            searchTerm,
                            this.client.twitterConfig.SUBSCRIPTION_TWEET_FETCH_LIMIT,
                            SearchMode.Top
                        );

                        const searchedProfiles = recentTweets.tweets.map((tweet) => tweet.username).filter((value, index, array) => array.indexOf(value) === index);
                        // TODO: figure out way to check if we are following the user, then put it in processUsersActions, and set following to null
                        profiles.push(...searchedProfiles.map((profile) => ({ profile, following: false })));
                    }
                    const results = await this.processUsersActions(profiles);

                    if (results) {
                        elizaLogger.log(`Processed ${results.length} users`, results);

                        const successfulFollows = results.filter((result) => result.follow).length;
                        if (successfulFollows > 0) {
                            nextActionShouldBeSearch = false
                            elizaLogger.log(
                                `Followed ${successfulFollows} users`
                            );
                        } else {
                            // Swich to search if we didn't find new users to follow
                            // TODO: consider to switch after n unsuccessful iterations
                            if (this.client.twitterConfig.TWITTER_ALLOW_SEARCH_USERS_SUBSCRIPTION) {
                                nextActionShouldBeSearch = true
                            }
                        }

                        elizaLogger.log(
                            `Next action processing scheduled in ${actionInterval} minutes. It will be a ${nextActionShouldBeSearch ? "search by topics" : "follow/unfollow from current following and home timeline"} action`
                        );


                        // Wait for the full interval before next processing
                        await new Promise((resolve) =>
                            setTimeout(resolve, actionInterval * 60 * 1000) // now in minutes
                        );
                    }
                } catch (error) {
                    elizaLogger.error(
                        "Error in action processing loop:",
                        error
                    );
                    // Add exponential backoff on error
                    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30s on error
                }
            }
        };


        if (this.client.twitterConfig.TWITTER_START_USERS_SUBSCRIPTION) {
            processActionsLoop().catch((error) => {
                elizaLogger.error(
                    "Fatal error in process actions loop:",
                    error
                );
            });
        } else {
            if (this.isDryRun) {
                elizaLogger.log(
                    "Action processing loop disabled (dry run mode)"
                );
            } else {
                elizaLogger.log(
                    "Action processing loop disabled by configuration"
                );
            }
        }
    }

    /**
     * Processes users actions (follow, unfollow). If isDryRun is true,
     * only simulates and logs actions without making API calls.
     */
    private async processUsersActions(profiles: ProfilesInfo[]) {
        if (this.isProcessing) {
            elizaLogger.log("Already processing users actions, skipping");
            return null;
        }

        try {
            this.isProcessing = true;
            this.lastProcessTime = Date.now();

            elizaLogger.log("Processing users actions", profiles.length);

            if (this.isDryRun) {
                elizaLogger.log("Dry run mode: simulating users actions");
                // return [];
            }

            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.twitterUsername,
                this.runtime.character.name,
                "twitter"
            );

            const results = [];
            for (const profile of profiles) {
                await new Promise((resolve) => setTimeout(resolve, 15 * 1000)); // sleep 15 s
                const userProfile = typeof profile.profile === "string" ? await this.client.twitterClient.getProfile(profile.profile) : profile.profile;

                // TODO: figure out way to check if we are following the user
                // if (profile.following === null) {
                // profile.following = await this.client.twitterClient.isFollowing(userProfile.username);
                // }

                await this.runtime.ensureUserExists(
                    stringToUuid(userProfile.userId),
                    userProfile.username,
                    userProfile.name,
                    "twitter"
                );

                const roomId = stringToUuid(
                    "twitter_generate_room-" + userProfile.username
                );

                const userTimeline = await this.client.fetchUserPosts(userProfile.userId, 10);

                const last_tweets = [];
                if (userTimeline.length === 0) {
                    elizaLogger.log("No tweets found for user", userProfile.username);
                    continue;
                }

                if (userTimeline.length > 10) {
                    userTimeline.splice(10);
                }

                for (const tweet of userTimeline) {
                    try {
                        // Skip if we've already processed this tweet
                        const memory =
                            await this.runtime.messageManager.getMemoryById(
                                stringToUuid(tweet.id + "-" + this.runtime.agentId)
                            );
                        if (memory) {
                            elizaLogger.log(
                                `Already processed tweet ID: ${tweet.id}`
                            );
                            continue;
                        }
                        last_tweets.push(tweet.text.replaceAll("\n", " "));
                        // last_tweets.push(`ID: ${tweet.id}\nFrom: ${tweet.name} (@${tweet.username})\nText: ${tweet.text}`);
                    } catch (error) {
                        elizaLogger.error("Error in processUserActions:", error, userProfile.username);
                        throw error;

                    }
                }

                const tweetState = await this.runtime.composeState(
                    {
                        userId: this.runtime.agentId,
                        roomId,
                        agentId: this.runtime.agentId,
                        content: { text: "", action: "" },
                    },
                    {
                        twitterUserName: this.twitterUsername,
                        lastTweets: last_tweets.map((tweet, idx) => `${idx + 1}. ${tweet}`).join("\n"),
                    }
                );

                const actionContext = composeContext({
                    state: tweetState,
                    template:
                        twitterUserActionTemplateWithoutFooter,
                });

                const actionResponse = await generateTweetActions({
                    runtime: this.runtime,
                    context: actionContext,
                    modelClass: ModelClass.LARGE,
                });

                if (!actionResponse) {
                    elizaLogger.log("No actions generated");
                    continue;
                }

                if (actionResponse.follow && !profile.following) {
                    elizaLogger.log("Following user", userProfile.username);
                    if (!this.isDryRun) {
                        await this.client.twitterClient.followUser(userProfile.username);
                    }
                    results.push({ follow: true, username: userProfile.username });
                }

                if (actionResponse.unfollow && profile.following) {
                    elizaLogger.log("Unfollowing user", userProfile.username);
                    if (!this.isDryRun) {
                        await this.client.unfollowUser(userProfile.username, userProfile.userId);
                    }
                    results.push({ unfollow: true, username: userProfile.username });
                }
            }

            return results;
        } catch (error) {
            elizaLogger.error("Error in processUserActions:", error);
            throw error;
        } finally {
            this.isProcessing = false;
            console.log("---------------------_>returning");
        }
    }

    async stop() {
        this.stopProcessingActions = true;
    }
}


interface ActionResponse {
    follow?: boolean;
    unfollow?: boolean;
}

const parseActionResponseFromText = (
    text: string
): { actions: ActionResponse } => {
    const actions: ActionResponse = {
        follow: false,
        unfollow: false,

    };

    // Regex patterns
    const followPattern = /\[FOLLOW\]/i;
    const unfollowPattern = /\[UNFOLLOW\]/i;

    // Check with regex
    actions.follow = followPattern.test(text);
    actions.unfollow = unfollowPattern.test(text);

    // Also do line by line parsing as backup
    const lines = text.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "[FOLLOW]") actions.follow = true;
        if (trimmed === "[UNFOLLOW]") actions.unfollow = true;
    }

    return { actions };
};


export async function generateTweetActions({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<ActionResponse | null> {
    let retryDelay = 1000;
    while (true) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });
            console.debug(
                "Received response from generateText for tweet actions:",
                response
            );
            const { actions } = parseActionResponseFromText(response.trim());
            if (actions) {
                console.debug("Parsed tweet actions:", actions);
                return actions;
            } else {
                elizaLogger.debug("generateTweetActions no valid response");
            }
        } catch (error) {
            elizaLogger.error("Error in generateTweetActions:", error);
            if (
                error instanceof TypeError &&
                error.message.includes("queueTextCompletion")
            ) {
                elizaLogger.error(
                    "TypeError: Cannot read properties of null (reading 'queueTextCompletion')"
                );
            }
        }
        elizaLogger.log(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}
