import { chromium } from 'playwright-extra';
// import { loadLastMessageTimes, saveLastMessageTimes } from '../utils/util.js';
import { supabase } from '../../supabase.js';

const URL = "https://www.parentsquare.com/signin";



// Function to save ParentSquare messages to Supabase
async function saveParentSquareMessagesToSupabase(messages: any[]) {
    if (messages.length === 0) {
        console.log('📭 No new ParentSquare messages to save to database');
        return { success: true, count: 0 };
    }

    console.log(`\n💾 Saving ${messages.length} ParentSquare message(s) to Supabase...`);

    // Transform messages to match database schema
    const messagesToInsert = messages.map(msg => ({
        thread_name: msg.thread,
        message_text: msg.message,
        timestamp: msg.time,
        from_user: msg.from,
        // We don't have threadId and messageId in the current structure
        // You might need to pass these from the main loop
        thread_id: msg.threadId || msg.thread, // fallback to thread name
        message_id: msg.messageId || `${msg.thread}-${Date.now()}` // generate if not available
    }));

    const { data, error } = await supabase
        .from('parentsquare_messages')
        .insert(messagesToInsert)
        .select();

    if (error) {
        console.error('❌ Error saving ParentSquare messages to Supabase:', error.message);
        return { success: false, error };
    }

    console.log(`✅ Successfully saved ${data.length} ParentSquare message(s) to database`);
    return { success: true, count: data.length, data };
}

// Load state from Supabase
async function loadLastMessageTimes(): Promise<Record<string, string>> {
    const { data, error } = await supabase
        .from('parentsquare_chat_state')
        .select('thread_id, last_message_id');

    if (error) {
        console.error('❌ Error loading ParentSquare state from Supabase:', error.message);
        return {};
    }

    const state: Record<string, string> = {};
    if (data) {
        data.forEach((row) => {
            state[row.thread_id] = row.last_message_id;
        });
    }

    console.log(`📥 Loaded state for ${Object.keys(state).length} ParentSquare thread(s) from Supabase`);
    return state;
}

// Save state to Supabase
async function saveLastMessageTimes(updatedIds: Record<string, { threadName: string; lastMessageId: string }>) {
    const records = Object.entries(updatedIds).map(([threadId, data]) => ({
        thread_id: threadId,
        thread_name: data.threadName,
        last_message_id: data.lastMessageId,
        updated_at: new Date().toISOString()
    }));

    if (records.length === 0) {
        console.log('No ParentSquare state to save');
        return;
    }

    const { error } = await supabase
        .from('parentsquare_chat_state')
        .upsert(records, { onConflict: 'thread_id' });

    if (error) {
        console.error('❌ Error saving ParentSquare state to Supabase:', error.message);
        throw error;
    }

    console.log(`💾 ParentSquare state saved for ${records.length} thread(s) to Supabase`);
}


export async function parentSquareLogin() {
    const browser = await chromium.launch({
           headless: true,
        args: ["--start-maximized", "--disable-blink-features=AutomationControlled", "--no-sandbox",
    "--disable-setuid-sandbox",]
    });

        // Try to load saved session from Supabase
    const { data: savedSession } = await supabase
        .from('auth_sessions')
        .select('session_data')
        .eq('service', 'parentsquare')
        .single();

    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // storageState: fs.existsSync(authFile) ? authFile : undefined
        storageState: savedSession?.session_data || undefined

    });

    const page = await context.newPage();
    await page.goto(URL, { waitUntil: "networkidle" });

    if (page.url().includes('/signin')) {
        await page.fill('input[name="session[email]"]', process.env.PS_EMAIL!);
        await page.fill('input[name="session[password]"]', process.env.PS_PASSWORD!);

        await page.click('input[name="commit"]');

        await page.waitForSelector(".sidebar");
        const sessionData = await page.context().storageState();
        
        await supabase
            .from('auth_sessions')
            .upsert({
                service: 'parentsquare',
                session_data: sessionData,
                updated_at: new Date().toISOString()
            });
        console.log(`Session saved to Database`);

        await browser.close()
    } else {
        console.log('Using existing session (cookies)');
        await page.locator('a.side-menu-item', { hasText: 'Messages' }).click();
        await page.waitForSelector("#chat-threads-container");

        const threads = page.locator('#chat-threads-container a.a-chat-thread');
        const threadCount = await threads.count();

        // const lastMessageIds = loadLastMessageTimes();
        // const newMessages = [];
        // const updatedIds: Record<string, string> = {};

         const lastMessageIds = await loadLastMessageTimes();
        const isFirstRun = Object.keys(lastMessageIds).length === 0;

        if (isFirstRun) {
            console.log('🎯 First run detected - will set baseline for all threads');
        }

        const newMessages = [];
        const updatedIds: Record<string, { threadName: string; lastMessageId: string }> = {};

        for (let i = 0; i < threadCount; i++) {
            const thread = threads.nth(i);

            const threadName = await thread.getAttribute('aria-label');
            const threadId = threadName || `thread-${i}`;

            await thread.click();

            await page.waitForSelector('#page_loading', { state: 'visible' }).catch(() => { });
            await page.waitForSelector('#page_loading', { state: 'hidden' });

            await page.waitForSelector(
                '#chat-messages-content .chat-message-container',
                { timeout: 5000 }
            );

            await page.waitForTimeout(300);

            const receivedBubbles = page.locator(
                '#chat-messages-content .chat-message-container ' +
                '.chat-message.chat-box.chat-thread.received-message'
            );

            const receivedCount = await receivedBubbles.count();
            if (receivedCount === 0) {
                console.log(`No received messages in ${threadName}`);
                continue;
            }

            const lastStoredId = lastMessageIds[threadId];
            let foundLastStored = !lastStoredId; // first run → true
            let latestReceivedId: string | null = null;

            // // FIRST RUN → only store last received ID
            // if (!lastStoredId) {
            //     latestReceivedId = await receivedBubbles
            //         .nth(receivedCount - 1)
            //         .getAttribute('id');

            //     if (latestReceivedId) {
            //         updatedIds[threadId] = latestReceivedId;
            //         console.log(`First run for ${threadName}, stored ${latestReceivedId}`);
            //     }

            //     continue;
            // }

              // FIRST RUN → only store last received ID
            if (!lastStoredId) {
                latestReceivedId = await receivedBubbles
                    .nth(receivedCount - 1)
                    .getAttribute('id');

                if (latestReceivedId) {
                    updatedIds[threadId] = {
                        threadName: threadName || threadId,
                        lastMessageId: latestReceivedId
                    };
                    console.log(`📍 Setting baseline - Last message ID: ${latestReceivedId}`);
                }

                continue;
            }

            // SUBSEQUENT RUNS → collect new received messages
            for (let j = 0; j < receivedCount; j++) {
                const bubble = receivedBubbles.nth(j);
                const messageId = await bubble.getAttribute('id');

                if (!messageId) continue;

                if (messageId === lastStoredId) {
                    foundLastStored = true;
                    continue;
                }

                if (!foundLastStored) continue;

                const container = bubble.locator('..');

                const timestamp = await container
                    .locator('.chat-message-timestamp .date')
                    .innerText();

                let messageText = '';

                const textDiv = container.locator(
                    'div.chat-message.row .col-xs-12[dir="auto"]'
                );

                if (await textDiv.count() > 0) {
                    messageText = await textDiv.innerText();
                } else {
                    const attachmentLinks = container.locator(
                        '.chat-attachments a[target="_blank"]'
                    );

                    if (await attachmentLinks.count() > 0) {
                        const names = (await attachmentLinks.allInnerTexts())
                            .map(t => t.replace(/Download:\s*/g, '').trim());

                        messageText = `[Attachment: ${names.join(', ')}]`;
                    } else {
                        continue;
                    }
                }

                newMessages.push({
                    threadId: threadId,      // ✅ Added
                    messageId: messageId,     // ✅ Added
                    thread: threadName,
                    message: messageText.trim(),
                    time: timestamp.trim(),
                    from: 'other'
                });

                latestReceivedId = messageId;
            }

        //     if (latestReceivedId) {
        //         updatedIds[threadId] = latestReceivedId;
        //         console.log(`New received messages in ${threadName}`);
        //     } else {
        //         updatedIds[threadId] = lastStoredId;
        //         console.log(`No new received messages in ${threadName}`);
        //     }
        // }

        // saveLastMessageTimes(updatedIds);

        if (latestReceivedId) {
                updatedIds[threadId] = {
                    threadName: threadName || threadId,
                    lastMessageId: latestReceivedId
                };
                const threadNewMessages = newMessages.filter(m => m.threadId === threadId);
                console.log(`📩 Found ${threadNewMessages.length} new message(s)`);
            } else {
                updatedIds[threadId] = {
                    threadName: threadName || threadId,
                    lastMessageId: lastStoredId
                };
                console.log(`✅ No new messages`);
            }
        }

        await saveLastMessageTimes(updatedIds);

        console.log('All new received messages:', newMessages);
        console.log(`Total new received messages: ${newMessages.length}`);

        // 💾 Save to Supabase
        if (newMessages.length > 0) {
            await saveParentSquareMessagesToSupabase(newMessages);
        }

        await browser.close();
    }
}

