import { supabase } from "../../supabase.js";


export async function saveStateForBrightWheel(
  stateData: BrightWheelStateMap
): Promise<void> {
  const records: BrightWheelChatStateRow[] = Object.entries(stateData).map(
    ([threadId, data]) => ({
      thread_id: threadId,
      chat_name: data.chatName,
      last_message_id: data.lastMessageId,
      updated_at: new Date().toISOString()
    })
  );

  if (records.length === 0) {
    console.log("No state to save");
    return;
  }

  const { error } = await supabase
    .from("brightwheel_chat_state")
    .upsert(records, { onConflict: "thread_id" });

  if (error) {
    console.error("❌ Error saving state to Supabase:", error.message);
    throw error;
  }

  console.log(`💾 State saved for ${records.length} chat(s) to Supabase`);
}
