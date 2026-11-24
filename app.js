import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, GithubAuthProvider, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, remove, query, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- 1. КОНФИГУРАЦИЯ ---
const firebaseConfig = {
    apiKey: "AIzaSyCiDGylKc7i_f8TVB6wlz-cM24D0GkU9gQ",
    authDomain: "owo-0451.firebaseapp.com",
    projectId: "owo-0451",
    storageBucket: "owo-0451.firebasestorage.app",
    messagingSenderId: "802512711321",
    appId: "1:802512711321:web:6b329262f4fdb7c81e1208",
    databaseURL: "https://owo-0451-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const githubProvider = new GithubAuthProvider();
const googleProvider = new GoogleAuthProvider();

// --- 2. DOM ЭЛЕМЕНТЫ ---
const dom = {
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

const dataForm = document.getElementById("data-form");
const dataInput = document.getElementById("data-input");
const submitBtn = document.getElementById("submit-btn");
const charCounter = document.getElementById("char-counter");
const searchInput = document.getElementById("search-input");
const searchClear = document.getElementById("search-clear");

// --- 3. СОСТОЯНИЕ ---
let currentMessages = [];
let currentSort = JSON.parse(localStorage.getItem('sortState')) || { type: 'time', direction: 'desc' };
let searchQuery = "";
let searchTimeout = null;

// --- 4. MARKDOWN НАСТРОЙКА ---
const marked = window.marked;
const DOMPurify = window.DOMPurify;

if (marked) marked.setOptions({ breaks: true, gfm: true });
if (DOMPurify) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A" && node.getAttribute("href")) {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
        }
    });
}

function renderMarkdown(text) {
    if (!marked || !DOMPurify) return text; // Если CDN не загрузился, показываем сырой текст
    return DOMPurify.sanitize(marked.parse(text), {
        ALLOWED_TAGS: ["a","b","strong","i","em","u","s","del","code","pre","p","br","ul","ol","li","blockquote","h1","h2","h3","h4","h5","h6","hr","table","thead","tbody","tr","th","td"],
        ALLOWED_ATTR: ["href", "title"]
    });
}

// --- 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function showError(msg) {
    dom.errorText.textContent = msg;
    dom.errorBanner.classList.remove("hidden");
    setTimeout(() => dom.errorBanner.classList.add("hidden"), 8000);
}

function showToast(text, actionText = null, onAction = null) {
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

function updateSortButtonsUI() {
    const isTime = currentSort.type === 'time';
    const isText = currentSort.type === 'text';

    dom.sortTimeBtn.classList.toggle("active", isTime);
    dom.sortTextBtn.classList.toggle("active", isText);
    dom.sortTimeBtn.textContent = `Времени ${isTime ? (currentSort.direction === 'desc' ? '↓' : '↑') : '↓'}`;
    dom.sortTextBtn.textContent = `Тексту ${isText ? (currentSort.direction === 'asc' ? '(А-Я)' : '(Я-А)') : '(А-Я)'}`;
}

// --- 6. ЛОГИКА ВВОДА ---
function updateCharCounter() {
    const len = dataInput.value.length;
    charCounter.textContent = `${len} / 500`;
    charCounter.classList.toggle("warning", len >= 450);
}
function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
}
dataInput.addEventListener("input", () => { updateCharCounter(); autoResize(dataInput); });
dataInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dataForm.requestSubmit(); }
});

// --- 7. ОТРИСОВКА ---
function renderCurrent() {
    dom.messagesList.innerHTML = "";
    
    let msgs = currentMessages;
    if (searchQuery) {
        const q = searchQuery.toLowerCase().replace(/ё/g, "е");
        msgs = msgs.filter(m => m.text.toLowerCase().replace(/ё/g, "е").includes(q));
    }

    const total = currentMessages.length;
    const filtered = msgs.length;
    
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

    const sorted = [...msgs].sort((a, b) => {
        let comp = currentSort.type === 'time' ? a.timestamp - b.timestamp : a.text.localeCompare(b.text, 'ru', { sensitivity: 'base' });
        if (comp === 0) comp = a.id.localeCompare(b.id);
        return currentSort.direction === 'asc' ? comp : -comp;
    });

    const fragment = document.createDocumentFragment();

    sorted.forEach(msg => {
        const li = document.createElement("li");
        li.dataset.id = msg.id;

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

        const timeCol = document.createElement("div");
        timeCol.className = "msg-time-col";
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            timeCol.innerHTML = `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
            if (msg.updatedAt) timeCol.innerHTML += `<br><span class="edited-badge" title="Изменено">(изм.)</span>`;
        } else {
            timeCol.textContent = "—";
        }

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

// --- 8. СОБЫТИЯ СПИСКА (Копирование, Удаление, Редактирование) ---
dom.messagesList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const li = btn.closest("li");
    const msgId = li.dataset.id;
    const msg = currentMessages.find(m => m.id === msgId);
    const uid = auth.currentUser?.uid;
    if (!uid || !msg) return;

    if (btn.classList.contains("copy-btn")) {
        navigator.clipboard.writeText(msg.text).then(() => showToast("Скопировано!")).catch(() => showError("Ошибка копирования"));
    }
    
    if (btn.classList.contains("delete-btn")) {
        const savedData = { text: msg.text, timestamp: msg.timestamp };
        if (msg.updatedAt) savedData.updatedAt = msg.updatedAt;
        
        try {
            await remove(ref(database, `messages/${uid}/${msgId}`));
            showToast("Удалено", "Отменить", async () => {
                await set(ref(database, `messages/${uid}/${msgId}`), savedData);
            });
        } catch (err) { showError(err.message); }
    }

    if (btn.classList.contains("edit-btn")) {
        li.querySelector(".msg-text").classList.add("hidden");
        const form = li.querySelector(".msg-edit-form");
        form.classList.remove("hidden");
        const input = form.querySelector(".msg-edit-input");
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }

    if (btn.classList.contains("cancel-btn")) {
        li.querySelector(".msg-text").classList.remove("hidden");
        li.querySelector(".msg-edit-form").classList.add("hidden");
    }

    if (btn.classList.contains("save-btn")) {
        const input = li.querySelector(".msg-edit-input");
        const newText = input.value.trim();
        if (!newText) return showError("Текст не может быть пустым");
        
        btn.disabled = true;
        try {
            await set(ref(database, `messages/${uid}/${msgId}`), {
                text: newText,
                timestamp: msg.timestamp,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            showError(err.message); btn.disabled = false;
        }
    }
});

// --- 9. АВТОРИЗАЦИЯ ---
async function login(provider) {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (error.code === "auth/popup-blocked" || error.code === "auth/popup-closed-by-user") {
            await signInWithRedirect(auth, provider);
        } else {
            showError(error.message);
        }
    }
}

document.getElementById("github-login-btn").addEventListener("click", () => login(githubProvider));
document.getElementById("google-login-btn").addEventListener("click", () => login(googleProvider));
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

getRedirectResult(auth).catch(err => showError(err.message));

onAuthStateChanged(auth, (user) => {
    if (user) {
        dom.authSection.classList.add("hidden");
        dom.appSection.classList.remove("hidden");
        dom.userInfo.textContent = user.displayName || user.email || user.uid;
        
        if (user.photoURL) {
            dom.userAvatar.src = user.photoURL;
            dom.userAvatar.classList.remove("hidden");
        } else {
            dom.userAvatar.classList.add("hidden");
        }

        const q = query(ref(database, `messages/${user.uid}`), limitToLast(500));
        onValue(q, (snapshot) => {
            const data = snapshot.val();
            currentMessages = [];
            if (data) {
                currentMessages = Object.entries(data).map(([id, value]) => ({
                    id,
                    text: typeof value?.text === "string" ? value.text : "",
                    timestamp: typeof value?.timestamp === "number" ? value.timestamp : 0,
                    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
                }));
            }
            renderCurrent();
        }, (error) => showError(error.message));
    } else {
        dom.authSection.classList.remove("hidden");
        dom.appSection.classList.add("hidden");
        dom.messagesList.innerHTML = "";
        currentMessages = [];
        searchInput.value = ""; searchQuery = ""; searchClear.classList.add("hidden");
    }
});

// --- 10. ОТПРАВКА ---
dataForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = dataInput.value.trim();
    if (!text || !auth.currentUser) return;

    submitBtn.disabled = true;
    try {
        await push(ref(database, `messages/${auth.currentUser.uid}`), {
            text: text,
            timestamp: serverTimestamp()
        });
        dataInput.value = ""; updateCharCounter(); autoResize(dataInput); dataInput.focus();
    } catch (error) {
        showError(error.message);
    } finally { submitBtn.disabled = false; }
});

// --- 11. ПОИСК, СОРТИРОВКА, ХОТКЕИ ---
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        searchClear.classList.toggle("hidden", !searchQuery);
        renderCurrent();
    }, 150);
});
searchClear.addEventListener("click", () => {
    searchInput.value = ""; searchQuery = ""; searchClear.classList.add("hidden"); renderCurrent(); searchInput.focus();
});

dom.sortTimeBtn.addEventListener("click", () => {
    if (currentSort.type === 'time') currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    else { currentSort.type = 'time'; currentSort.direction = 'desc'; }
    localStorage.setItem('sortState', JSON.stringify(currentSort));
    updateSortButtonsUI(); renderCurrent();
});
dom.sortTextBtn.addEventListener("click", () => {
    if (currentSort.type === 'text') currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    else { currentSort.type = 'text'; currentSort.direction = 'asc'; }
    localStorage.setItem('sortState', JSON.stringify(currentSort));
    updateSortButtonsUI(); renderCurrent();
});

document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (!dom.appSection.classList.contains("hidden")) { e.preventDefault(); searchInput.focus(); }
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = ""; searchQuery = ""; searchClear.classList.add("hidden"); renderCurrent(); searchInput.blur();
    }
});

// --- 12. ИНДИКАТОР СЕТИ ---
onValue(ref(database, ".info/connected"), (snap) => {
    if (snap.val() === true) dom.connStatus.classList.add("hidden");
    else dom.connStatus.classList.remove("hidden");
});

// Инициализация UI
updateSortButtonsUI();
updateCharCounter();
