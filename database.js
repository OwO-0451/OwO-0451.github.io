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
                timestamp: typeof value?.timestamp === "number" ? value.timestamp : 0
            }));
        }
        onData(messages);
    }, onError);
}

export async function addMessage(uid, text) {
    const userMessagesRef = ref(database, `messages/${uid}`);
    const newMessageRef = push(userMessagesRef);
    await set(newMessageRef, {
        text: text,
        timestamp: serverTimestamp()
    });
}

export async function deleteMessage(uid, msgId) {
    const msgRef = ref(database, `messages/${uid}/${msgId}`);
    await remove(msgRef);
}
