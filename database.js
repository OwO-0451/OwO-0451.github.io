import { database } from "./config.js";
import { ref, push, set, onValue, remove, query, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const MAX_MESSAGES = 500;

export function listenToMessages(uid, onData, onError) {
    const userMessagesRef = ref(database, `messages/${uid}`);
    const recentQuery = query(userMessagesRef, limitToLast(MAX_MESSAGES));

    return onValue(recentQuery, (snapshot) => {
        const data = snapshot.val();
        let messages = [];
        if (data) {
            messages = Object.entries(data).map(([id, value]) => ({
                id,
                text: typeof value?.text === "string" ? value.text : "",
                timestamp: typeof value?.timestamp === "number" ? value.timestamp : 0,
                updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
            }));
        }
        onData(messages);
    }, onError);
}

export async function addMessage(uid, text) {
    const userMessagesRef = ref(database, `messages/${uid}`);
    await push(userMessagesRef, { text, timestamp: serverTimestamp() });
}

export async function updateMessage(uid, msgId, newText, originalTimestamp) {
    const msgRef = ref(database, `messages/${uid}/${msgId}`);
    await set(msgRef, {
        text: newText,
        timestamp: originalTimestamp,
        updatedAt: serverTimestamp()
    });
}

export async function deleteMessage(uid, msgId) {
    await remove(ref(database, `messages/${uid}/${msgId}`));
}
