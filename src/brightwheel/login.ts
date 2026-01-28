import {  URL } from 'url';
import { chromium } from 'playwright-extra';
import dotenv from 'dotenv';
import { supabase } from '../../supabase.js';

dotenv.config();


const SITE_URL = "https://schools.mybrightwheel.com/sign-in";


// Function to save messages to Supabase
async function saveMessagesToSupabase(chatData: any) {
    const messagesToInsert = [];

    for (const chat of chatData) {
        if (chat.newMessages && chat.newMessages.length > 0) {
            for (const msg of chat.newMessages) {
                messagesToInsert.push({
                    thread_id: chat.threadId,
                    chat_name: chat.chatName,
                    message_id: msg.id,
                    sender: msg.sender,
                    timestamp: msg.timestamp,
                    content: msg.content
                });
            }
        }
    }

    if (messagesToInsert.length === 0) {
        console.log('📭 No new messages to save to database');
        return { success: true, count: 0 };
    }

    console.log(`\n💾 Saving ${messagesToInsert.length} message(s) to Supabase...`);

    const { data, error } = await supabase
        .from('brightwheel_messages')
        .insert(messagesToInsert)
        .select();

    if (error) {
        console.error('❌ Error saving to Supabase:', error.message);
        return { success: false, error };
    }

    console.log(`✅ Successfully saved ${data.length} message(s) to database`);
    return { success: true, count: data.length, data };
}

export async function brightWheelLogin() {
    const browser = await chromium.launch({
        headless: true,
         args: ["--start-maximized", "--disable-blink-features=AutomationControlled", "--no-sandbox",
    "--disable-setuid-sandbox",]
    });

      // Try to load saved session from Supabase
    const { data: savedSession } = await supabase
        .from('auth_sessions')
        .select('session_data')
        .eq('service', 'brightwheel')
        .single();

  const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // storageState: fs.existsSync(authFile) ? authFile : undefined
        storageState: savedSession?.session_data || undefined

    });

    const page = await context.newPage();
    await page.goto(SITE_URL, { waitUntil: "networkidle" });

    if (page.url().includes('/sign-in')) {
        await page.fill('input[name="username"]', process.env.BW_EMAIL!);
        await page.fill('input[name="password"]', process.env.BW_PASSWORD!);

        await page.getByTestId('sign-in-button').click();
        await page.waitForURL('https://schools.mybrightwheel.com/');
         const sessionData = await page.context().storageState();
        
        await supabase
            .from('auth_sessions')
            .upsert({
                service: 'brightwheel',
                session_data: sessionData,
                updated_at: new Date().toISOString()
            });
        console.log(`Session saved to Database`);
    } else {

        console.log('Using existing session (cookies)');
        await page.goto("https://schools.mybrightwheel.com/messages/messages", { waitUntil: "networkidle" });

        const previousState = loadState();
        const isFirstRun = Object.keys(previousState).length === 0;

        const currentData = await processAllChats(page, previousState, isFirstRun);

        if (isFirstRun) {
            console.log('\n🎯 First run - baseline set for all chats');
        } else {
            // Display summary of new messages
            const chatsWithNewMessages = currentData.filter((chat: any) => chat.newMessages && chat.newMessages.length > 0);

            if (chatsWithNewMessages.length > 0) {
                console.log('\n=== NEW MESSAGES SUMMARY ===');
                chatsWithNewMessages.forEach((chat: any) => {
                    console.log(`\n📩 ${chat.chatName} (${chat.newMessages.length} new message(s)):`);
                    chat.newMessages.forEach((msg: any, idx: number) => {
                        console.log(`   ${idx + 1}. ${msg.sender} at ${msg.timestamp}`);
                        console.log(`      "${msg.content}"`);
                    });
                });

                // 💾 Save new messages to Supabase
                await saveMessagesToSupabase(currentData);
            } else {
                console.log('\n✅ No new messages in any chat');
            }
        }

        // Save the updated state
        const newState: any = {};
        currentData.forEach((chat: any) => {
            newState[chat.threadId] = {
                chatName: chat.chatName,
                lastMessageId: chat.lastMessageId
            };
        });

        saveState(newState);
        await browser.close()
    }
}

async function getMessagesAfter(page: any, afterMessageId: string | null) {
    await page.waitForSelector('[data-testid="thread-container"]', {
        timeout: 5000
    });

    const emptyState = page.locator(
        '[data-testid="thread-content-message-list-empty-state"]'
    );

    if (await emptyState.count() > 0) {
        return [];
    }

    const allMessages = page.locator(
        '[data-testid="thread-content-message-list"] > div[id]'
    );

    const messageCount = await allMessages.count();
    const newMessages = [];
    let foundStoredMessage = afterMessageId === null;

    for (let i = 0; i < messageCount; i++) {
        const container = allMessages.nth(i);

        const className = await container.getAttribute('class');
        if (className?.includes('sent-message')) continue;

        const messageId = await container.getAttribute('id');
        if (!messageId) continue;

        if (messageId === afterMessageId) {
            foundStoredMessage = true;
            continue;
        }

        if (foundStoredMessage) {
            const sender = await container
                .locator('.frontend-1ko2gbq p')
                .first()
                .innerText()
                .catch(() => 'Unknown');

            const timestamp = await container
                .locator('.frontend-1ko2gbq p')
                .nth(1)
                .innerText()
                .catch(() => '');

            const content = await container
                .locator('.frontend-1eolz88')
                .innerText()
                .catch(() => '');

            newMessages.push({
                id: messageId,
                sender,
                timestamp,
                content: content.trim()
            });
        }
    }

    return newMessages;
}

async function getLastReceivedMessage(page: any) {
    await page.waitForSelector('[data-testid="thread-container"]', {
        timeout: 5000
    });

    const emptyState = page.locator(
        '[data-testid="thread-content-message-list-empty-state"]'
    );

    if (await emptyState.count() > 0) {
        return null;
    }

    const allMessages = page.locator(
        '[data-testid="thread-content-message-list"] > div[id]'
    );

    const messageCount = await allMessages.count();

    // Get last received (non-sent) message
    for (let i = messageCount - 1; i >= 0; i--) {
        const container = allMessages.nth(i);

        const className = await container.getAttribute('class');
        if (className?.includes('sent-message')) continue;

        const messageId = await container.getAttribute('id');
        if (!messageId) continue;

        const sender = await container
            .locator('.frontend-1ko2gbq p')
            .first()
            .innerText()
            .catch(() => 'Unknown');

        const timestamp = await container
            .locator('.frontend-1ko2gbq p')
            .nth(1)
            .innerText()
            .catch(() => '');

        const content = await container
            .locator('.frontend-1eolz88')
            .innerText()
            .catch(() => '');

        return {
            id: messageId,
            sender,
            timestamp,
            content: content.trim()
        };
    }

    return null;
}

async function processAllChats(page: any, previousState: any, isFirstRun: boolean) {
    const chatRows = page.locator('[data-testid="messages-table"] [role="button"]');
    const chatCount = await chatRows.count();
    console.log(`Found ${chatCount} chats`);

    const allChatData = [];

    for (let i = 0; i < chatCount; i++) {
        const currentChatRows = page.locator('[data-testid="messages-table"] [role="button"]');
        const row = currentChatRows.nth(i);

        const chatName = await row
            .locator('p')
            .first()
            .innerText()
            .catch(() => `Chat ${i + 1}`);

        console.log(`\n=== Opening chat ${i + 1}: ${chatName} ===`);

        await row.click();
        await page.waitForSelector('[data-testid="thread-container"]', { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(1500);

        const url = page.url();
        const threadId = new URL(url).searchParams.get('thread') ?? `chat-${i + 1}`;

        let chatData: any = {
            chatIndex: i + 1,
            chatName,
            threadId,
            newMessages: [],
            lastMessageId: null
        };

        // Check if this chat exists in previous state
        const chatExistsInState = previousState[threadId] !== undefined;

        if (isFirstRun || !chatExistsInState) {
            // First run OR new chat: just get and store the last message ID as baseline
            const lastMessage = await getLastReceivedMessage(page);
            console.log(`📍 ${!chatExistsInState && !isFirstRun ? 'New chat detected - setting' : 'Setting'} baseline - Last message ID: ${lastMessage?.id || 'none'}`);

            chatData.lastMessageId = lastMessage?.id ?? null;
        } else {
            // Existing chat on subsequent run: get all new messages
            const storedMessageId = previousState[threadId].lastMessageId;
            const newMessages = await getMessagesAfter(page, storedMessageId);

            if (newMessages.length > 0) {
                console.log(`📩 Found ${newMessages.length} new message(s)`);
                chatData.newMessages = newMessages;
                // Update lastMessageId to the most recent message
                chatData.lastMessageId = newMessages[newMessages.length - 1].id;
            } else {
                console.log(`✅ No new messages`);
                // Keep the existing stored ID
                chatData.lastMessageId = storedMessageId;
            }
        }

        allChatData.push(chatData);

        // Close chat
        const closeButton = page.locator('[data-testid="thread-close-btn"]');
        if (await closeButton.isVisible()) {
            await closeButton.click();
            await page.waitForSelector('[data-testid="thread-container"]', { state: 'hidden', timeout: 5000 });
        }

        await page.waitForTimeout(1000);
    }

    return allChatData;
}

// Load state from Supabase
async function loadState() {
    const { data, error } = await supabase
        .from('brightwheel_chat_state')
        .select('thread_id, chat_name, last_message_id');

    if (error) {
        console.error('❌ Error loading state from Supabase:', error.message);
        return {};
    }

    // Convert array to object format
    const state: any = {};
    if (data) {
        data.forEach((row) => {
            state[row.thread_id] = {
                chatName: row.chat_name,
                lastMessageId: row.last_message_id
            };
        });
    }

    return state;
}

// Save state to Supabase
async function saveState(stateData: any) {
    const records = Object.entries(stateData).map(([threadId, data]: [string, any]) => ({
        thread_id: threadId,
        chat_name: data.chatName,
        last_message_id: data.lastMessageId,
        updated_at: new Date().toISOString()
    }));

    if (records.length === 0) {
        console.log('No state to save');
        return;
    }

    const { error } = await supabase
        .from('brightwheel_chat_state')
        .upsert(records, { onConflict: 'thread_id' });

    if (error) {
        console.error('❌ Error saving state to Supabase:', error.message);
        throw error;
    }

    console.log(`💾 State saved for ${records.length} chat(s) to Supabase`);
}