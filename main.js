import * as Auth from "./auth.js";
import * as DB from "./database.js";
import { dom, showError, renderMessages, updateSortButtonsUI, showToast } from "./ui.js";
import { database } from "./config.js";
import { ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const loginGithubBtn = document.getElementById("github-login-btn");
const loginGoogleBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const dataForm = document.getElementById("data-form");
const dataInput = document.getElementById("data-input");
const submitBtn = document.getElementById("submit-btn");
const charCounter = document.getElementById("char-counter");
const searchInput = document.getElementById("search-input");
const searchClear = document.getElementById("search-clear");

let unsubscribeMessages = null;
let currentMessages = [];
let currentSort = JSON.parse(localStorage.getItem('sortState')) || { type: 'time', direction: 'desc' };
let searchQuery = "";
let searchTimeout = null;

// --- Инициализация UI ---
updateSortButtonsUI(currentSort);
updateCharCounter();

// --- Индикатор соединения (Вариант B) ---
onValue(ref(database, ".info/connected"), (snap) => {
    if (snap.val() === true) {
        dom.connStatus.classList.add("hidden");
    } else {
        dom.connStatus.classList.remove("hidden");
    }
});

// --- Логика ввода и счетчика ---
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

// --- Сортировка ---
function saveSort() { localStorage.setItem('sortState', JSON.stringify(currentSort)); updateSortButtonsUI(currentSort); renderCurrent(); }
dom.sortTimeBtn.addEventListener("click", () => {
    if (currentSort.type === 'time') currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    else { currentSort.type = 'time'; currentSort.direction = 'desc'; }
    saveSort();
});
dom.sortTextBtn.addEventListener("click", () => {
    if (currentSort.type === 'text') currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    else { currentSort.type = 'text'; currentSort.direction = 'asc'; }
    saveSort();
});

// --- Поиск ---
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

// --- Хоткеи ---
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (!dom.appSection.classList.contains("hidden")) { e.preventDefault(); searchInput.focus(); }
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = ""; searchQuery = ""; searchClear.classList.add("hidden"); renderCurrent(); searchInput.blur();
    }
});

// --- Рендер ---
function renderCurrent() {
    renderMessages(currentMessages, currentSort, searchQuery, Auth.auth?.currentUser?.uid);
}

// --- Авторизация ---
loginGithubBtn.addEventListener("click", () => Auth.login(Auth.githubProvider).catch(e => showError(e.message)));
loginGoogleBtn.addEventListener("click", () => Auth.login(Auth.googleProvider).catch(e => showError(e.message)));
logoutBtn.addEventListener("click", () => Auth.logout());
Auth.checkRedirectResult();

Auth.subscribeToAuth((user) => {
    if (user) {
        dom.authSection.classList.add("hidden"); dom.appSection.classList.remove("hidden");
        dom.userInfo.textContent = user.displayName || user.email || user.uid;
        if (user.photoURL) { dom.userAvatar.src = user.photoURL; dom.userAvatar.classList.remove("hidden"); }

        if (unsubscribeMessages) unsubscribeMessages();
        unsubscribeMessages = DB.listenToMessages(user.uid, (messages) => {
            currentMessages = messages;
            renderCurrent();
        }, (error) => showError(error.message));
    } else {
        dom.authSection.classList.remove("hidden"); dom.appSection.classList.add("hidden");
        dom.messagesList.innerHTML = ""; currentMessages = [];
        searchInput.value = ""; searchQuery = ""; searchClear.classList.add("hidden");
        if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    }
});

// --- Отправка ---
dataForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = dataInput.value.trim();
    if (!text || !Auth.auth.currentUser) return;

    submitBtn.disabled = true;
    try {
        await DB.addMessage(Auth.auth.currentUser.uid, text);
        dataInput.value = ""; updateCharCounter(); autoResize(dataInput); dataInput.focus();
    } catch (error) {
        showError(error.message);
    } finally { submitBtn.disabled = false; }
});

// --- Делегирование событий списка (Копирование, Удаление, Редактирование) ---
dom.messagesList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const li = btn.closest("li");
    const msgId = li.dataset.id;
    const msg = currentMessages.find(m => m.id === msgId);
    const uid = Auth.auth?.currentUser?.uid;
    if (!uid || !msg) return;

    // Копировать
    if (btn.classList.contains("copy-btn")) {
        navigator.clipboard.writeText(msg.text).then(() => showToast("Скопировано!")).catch(() => showError("Ошибка копирования"));
    }
    
    // Удалить с Undo
    if (btn.classList.contains("delete-btn")) {
        const savedData = { text: msg.text, timestamp: msg.timestamp };
        if (msg.updatedAt) savedData.updatedAt = msg.updatedAt;
        
        try {
            await DB.deleteMessage(uid, msgId);
            showToast("Удалено", "Отменить", async () => {
                await set(ref(database, `messages/${uid}/${msgId}`), savedData);
            });
        } catch (err) { showError(err.message); }
    }

    // Редактировать (открыть форму)
    if (btn.classList.contains("edit-btn")) {
        li.querySelector(".msg-text").classList.add("hidden");
        const form = li.querySelector(".msg-edit-form");
        form.classList.remove("hidden");
        const input = form.querySelector(".msg-edit-input");
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }

    // Отмена редактирования
    if (btn.classList.contains("cancel-btn")) {
        li.querySelector(".msg-text").classList.remove("hidden");
        li.querySelector(".msg-edit-form").classList.add("hidden");
    }

    // Сохранить изменения
    if (btn.classList.contains("save-btn")) {
        const input = li.querySelector(".msg-edit-input");
        const newText = input.value.trim();
        if (!newText) return showError("Текст не может быть пустым");
        
        btn.disabled = true;
        try {
            await DB.updateMessage(uid, msgId, newText, msg.timestamp);
        } catch (err) {
            showError(err.message); btn.disabled = false;
        }
    }
});
