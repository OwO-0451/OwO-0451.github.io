export const dom = {
    authSection: document.getElementById("auth-section"),
    appSection: document.getElementById("app-section"),
    userInfo: document.getElementById("user-info"),
    userAvatar: document.getElementById("user-avatar"),
    messagesList: document.getElementById("messages-list"),
    messagesCount: document.getElementById("messages-count"),
    sortTimeBtn: document.getElementById("sort-time-btn"),
    sortTextBtn: document.getElementById("sort-text-btn"),
    errorBanner: document.getElementById("error-banner"),
    errorText: document.getElementById("error-text")
};

export function showError(msg) {
    dom.errorText.textContent = msg;
    dom.errorBanner.classList.remove("hidden");
    setTimeout(() => dom.errorBanner.classList.add("hidden"), 8000);
}

export function updateSortButtonsUI(sortState) {
    const isTime = sortState.type === 'time';
    const isText = sortState.type === 'text';

    dom.sortTimeBtn.classList.toggle("active", isTime);
    dom.sortTextBtn.classList.toggle("active", isText);
    dom.sortTimeBtn.setAttribute("aria-pressed", String(isTime));
    dom.sortTextBtn.setAttribute("aria-pressed", String(isText));

    dom.sortTimeBtn.textContent = `Времени ${isTime ? (sortState.direction === 'desc' ? '↓' : '↑') : '↓'}`;
    dom.sortTextBtn.textContent = `Тексту ${isText ? (sortState.direction === 'asc' ? '(А-Я)' : '(Я-А)') : '(А-Я)'}`;
}

export function renderMessages(messages, sortState, uid) {
    dom.messagesList.innerHTML = "";
    dom.messagesCount.textContent = messages.length ? `(${messages.length})` : "";

    if (messages.length === 0) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "Сообщений пока нет. Напишите первое!";
        dom.messagesList.appendChild(li);
        return;
    }

    // Сортировка
    const sorted = [...messages].sort((a, b) => {
        let comp = 0;
        if (sortState.type === 'time') {
            comp = a.timestamp - b.timestamp;
        } else {
            comp = a.text.localeCompare(b.text, 'ru', { sensitivity: 'base' });
        }
        if (comp === 0) comp = a.id.localeCompare(b.id);
        return sortState.direction === 'asc' ? comp : -comp;
    });

    const fragment = document.createDocumentFragment();

    sorted.forEach(msg => {
        const li = document.createElement("li");

        const textDiv = document.createElement("div");
        textDiv.className = "msg-text-col";
        textDiv.textContent = msg.text;

        const timeDiv = document.createElement("div");
        timeDiv.className = "msg-time-col";
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            timeDiv.textContent = `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
        } else {
            timeDiv.textContent = "—";
        }

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "Удалить";
        delBtn.disabled = !uid;
        delBtn.dataset.id = msg.id;

        li.appendChild(textDiv);
        li.appendChild(timeDiv);
        li.appendChild(delBtn);
        fragment.appendChild(li);
    });

    dom.messagesList.appendChild(fragment);
}
