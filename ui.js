import { marked } from "https://cdn.jsdelivr.net/npm/marked@12/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3/+esm";

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
    errorText: document.getElementById("error-text"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toast-text"),
    toastAction: document.getElementById("toast-action"),
    connStatus: document.getElementById("connection-status")
};

// Настройка Markdown
marked.setOptions({ breaks: true, gfm: true });
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
    }
});

function renderMarkdown(text) {
    return DOMPurify.sanitize(marked.parse(text), {
        ALLOWED_TAGS: ["a","b","strong","i","em","u","s","del","code","pre","p","br","ul","ol","li","blockquote","h1","h2","h3","h4","h5","h6","hr","table","thead","tbody","tr","th","td"],
        ALLOWED_ATTR: ["href", "title"]
    });
}

export function showError(msg) {
    dom.errorText.textContent = msg;
    dom.errorBanner.classList.remove("hidden");
    setTimeout(() => dom.errorBanner.classList.add("hidden"), 8000);
}

export function showToast(text, actionText = null, onAction = null) {
    dom.toastText.textContent = text;
    if (actionText && onAction) {
        dom.toastAction.textContent = actionText;
        dom.toastAction.classList.remove("hidden");
        dom.toastAction.onclick = () => { dom.toast.classList.add("hidden"); onAction(); };
    } else {
        dom.toastAction.classList.add("hidden");
        dom.toastAction.onclick = null;
    }
    dom.toast.classList.remove("hidden");
    setTimeout(() => dom.toast.classList.add("hidden"), 5000);
}

document.getElementById("toast-close").onclick = () => dom.toast.classList.add("hidden");

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

export function renderMessages(allMessages, sortState, searchQuery, uid) {
    dom.messagesList.innerHTML = "";
    
    // Фильтрация
    let messages = allMessages;
    if (searchQuery) {
        const q = searchQuery.toLowerCase().replace(/ё/g, "е");
        messages = messages.filter(m => m.text.toLowerCase().replace(/ё/g, "е").includes(q));
    }

    const total = allMessages.length;
    const filtered = messages.length;
    
    if (total === 0) {
        dom.messagesCount.textContent = "";
        dom.messagesList.innerHTML = '<li class="empty">Сообщений пока нет. Напишите первое!</li>';
        return;
    }

    dom.messagesCount.textContent = searchQuery ? `(${filtered} из ${total})` : `(${total})`;

    if (filtered === 0) {
        dom.messagesList.innerHTML = `<li class="empty">Ничего не найдено по запросу «${searchQuery}»</li>`;
        return;
    }

    // Сортировка
    const sorted = [...messages].sort((a, b) => {
        let comp = sortState.type === 'time' ? a.timestamp - b.timestamp : a.text.localeCompare(b.text, 'ru', { sensitivity: 'base' });
        if (comp === 0) comp = a.id.localeCompare(b.id);
        return sortState.direction === 'asc' ? comp : -comp;
    });

    const fragment = document.createDocumentFragment();

    sorted.forEach(msg => {
        const li = document.createElement("li");
        li.dataset.id = msg.id;

        // 1. Текст и форма редактирования
        const textCol = document.createElement("div");
        textCol.className = "msg-text-col";
        
        const textView = document.createElement("div");
        textView.className = "msg-text";
        textView.innerHTML = renderMarkdown(msg.text);

        const editForm = document.createElement("div");
        editForm.className = "msg-edit-form hidden";
        editForm.innerHTML = `
            <textarea class="msg-edit-input" rows="2" maxlength="500"></textarea>
            <div class="msg-edit-actions">
                <button type="button" class="save-btn">Сохранить</button>
                <button type="button" class="cancel-btn">Отмена</button>
            </div>
        `;
        editForm.querySelector(".msg-edit-input").value = msg.text;

        textCol.appendChild(textView);
        textCol.appendChild(editForm);

        // 2. Время
        const timeCol = document.createElement("div");
        timeCol.className = "msg-time-col";
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            timeCol.innerHTML = `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
            if (msg.updatedAt) timeCol.innerHTML += `<br><span class="edited-badge" title="Изменено">(изм.)</span>`;
        } else {
            timeCol.textContent = "—";
        }

        // 3. Кнопки
        const actions = document.createElement("div");
        actions.className = "msg-actions";
        actions.innerHTML = `
            <button type="button" class="copy-btn" title="Копировать">📋</button>
            <button type="button" class="edit-btn" title="Редактировать">✏️</button>
            <button type="button" class="delete-btn" title="Удалить">🗑️</button>
        `;

        li.appendChild(textCol);
        li.appendChild(timeCol);
        li.appendChild(actions);
        fragment.appendChild(li);
    });

    dom.messagesList.appendChild(fragment);
}
