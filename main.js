import * as Auth from "./auth.js";
import * as DB from "./database.js";
import { dom, showError, renderMessages, updateSortButtonsUI } from "./ui.js";

// Элементы формы
const loginGithubBtn = document.getElementById("github-login-btn");
const loginGoogleBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const dataForm = document.getElementById("data-form");
const dataInput = document.getElementById("data-input");
const submitBtn = document.getElementById("submit-btn");

let unsubscribeMessages = null;
let currentMessages = [];

let currentSort = JSON.parse(localStorage.getItem('sortState')) || { type: 'time', direction: 'desc' };

function saveSort() {
    localStorage.setItem('sortState', JSON.stringify(currentSort));
    updateSortButtonsUI(currentSort);
    renderMessages(currentMessages, currentSort, Auth.auth?.currentUser?.uid);
}

// --- Сортировка ---
dom.sortTimeBtn.addEventListener("click", () => {
    if (currentSort.type === 'time') {
        currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
        currentSort.type = 'time';
        currentSort.direction = 'desc';
    }
    saveSort();
});

dom.sortTextBtn.addEventListener("click", () => {
    if (currentSort.type === 'text') {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.type = 'text';
        currentSort.direction = 'asc';
    }
    saveSort();
});

// --- Авторизация ---
loginGithubBtn.addEventListener("click", () => Auth.login(Auth.githubProvider).catch(e => showError(e.message)));
loginGoogleBtn.addEventListener("click", () => Auth.login(Auth.googleProvider).catch(e => showError(e.message)));
logoutBtn.addEventListener("click", () => Auth.logout());

Auth.checkRedirectResult();

Auth.subscribeToAuth((user) => {
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

        // Подписка на БД
        if (unsubscribeMessages) unsubscribeMessages();
        unsubscribeMessages = DB.listenToMessages(
            user.uid,
            (messages) => {
                currentMessages = messages;
                renderMessages(currentMessages, currentSort, user.uid);
            },
            (error) => showError(error.message)
        );
    } else {
        dom.authSection.classList.remove("hidden");
        dom.appSection.classList.add("hidden");
        dom.messagesList.innerHTML = "";
        currentMessages = [];
        
        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }
    }
});

// --- Добавление ---
dataForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = dataInput.value.trim();
    if (!text || !Auth.auth.currentUser) return;

    submitBtn.disabled = true;
    try {
        await DB.addMessage(Auth.auth.currentUser.uid, text);
        dataInput.value = "";
    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
    }
});

// --- Удаление (делегирование событий) ---
dom.messagesList.addEventListener("click", async (e) => {
    if (e.target.classList.contains("delete-btn")) {
        const msgId = e.target.dataset.id;
        const uid = Auth.auth?.currentUser?.uid;
        if (uid && confirm("Удалить сообщение?")) {
            try {
                await DB.deleteMessage(uid, msgId);
            } catch (error) {
                showError(error.message);
            }
        }
    }
});

// Инициализация UI
updateSortButtonsUI(currentSort);
