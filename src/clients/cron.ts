import cron from 'node-cron';
import { TwitterManager } from "./client-twitter/src/index.ts";
import {CerebroClient} from "./client-cerebro/cerebroClient.ts";
import {CerebroClientInterface} from "./client-cerebro/client.ts";

export async function InitCron (manager: TwitterManager){
    console.log('Cron initilized');

    const cerebroClient: CerebroClient = await CerebroClientInterface.start(this.runtime);

    cron.schedule('0 * * * *', async () => {
        let prevIds: string[]= [];
        for (let i = 0; i < 10; i++) {
            const timeline = await manager.client.twitterClient.fetchFollowingTimeline(50, prevIds);
            let result = await  cerebroClient.sendTweets({"user": manager.client.profile?.username, "tweets": timeline});
            if (result.next != null && result.next) {
                timeline.forEach((item)=> prevIds.push(item.rest_id));
                continue;
            } else  if (result.next != null && result.next == false) {
                break;
            }
        }
    });

    console.log('Cron initilized');
}
