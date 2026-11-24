import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserLocalPersistence,
    GithubAuthProvider,
    GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    set,
    onValue,
    remove,
    query,
    limitToLast,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ============================================================
// ЧТО СДЕЛАТЬ ПЕРЕД ЗАПУСКОМ (см. README / инструкцию):
// 1. Firebase Console → Authentication → Sign-in method:
//    включить Google и (опционально) GitHub.
// 2. Firebase Console → Authentication → Settings → Authorized domains:
//    добавить ВАШ домен GitHub Pages (например, username.github.io).
// 3. Firebase Console → Realtime Database → Rules:
//    вставить правила из database.rules.json и нажать Publish.
// 4. Google Cloud Console → APIs & Services → Credentials:
//    ограничить API-ключ по домену username.github.io и по нужным API.
// ============================================================

// --- Константы ---
const PATHS = {
    messages: (uid) => `messages/${uid}`,
    connected: ".info/connected",
    serverTimeOffset: ".info/serverTimeOffset"
};

const SORT = {
    TIME: "time",
    TEXT: "text",
    ASC: "asc",
    DESC: "desc"
};

const SORT_STORAGE_KEY = "messages-sort";
const MAX_MESSAGES = 500;
const MAX_TEXT_LENGTH = 500;
const ERROR_TIMEOUT_MS = 8000;

// --- Конфигурация Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyCiDGylKc7i_f8TVB6wlz-cM24D0GkU9gQ",
    authDomain: "owo-0451.firebaseapp.com",
    projectId: "owo-0451",
    storageBucket: "owo-0451.firebasestorage.app",
    messagingSenderId: "802512711321",
    appId: "1:802512711321:web:6b329262f4fdb7c81e1208",
    databaseURL: "https://owo-0451-default-rtdb.firebaseio.com"
};

// --- Инициализация ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// Локализация ошибок Firebase по языку устройства
auth.useDeviceLanguage();

// Персистентность сессии между вкладками и перезапусками браузера
setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[Firebase] Не удалось установить persistence:", err.code);
});

// --- Провайдеры ---
const githubProvider = new GithubAuthProvider();
const googleProvider = new GoogleAuthProvider();

// --- DOM ---
const $ = (id) => document.getElementById(id);

const githubLoginBtn = $("github-login-btn");
const googleLoginBtn = $("google-login-btn");
const logoutBtn = $("logout-btn");
const userInfo = $("user-info");
const userAvatar = $("user-avatar");
const authSection = $("auth-section");
const appSection = $("app-section");
const dataForm = $("data-form");
const dataInput = $("data-input");
const submitBtn = $("submit-btn");
const messagesList = $("messages-list");
const messagesCount = $("messages-count");

const sortTimeBtn = $("sort-time-btn");
const sortTextBtn = $("sort-text-btn");

const errorBanner = $("error-banner");
const errorText = $("error-text");
const errorClose = $("error-close");

const confirmModal = $("confirm-modal");
const confirmTitle = $("confirm-title");
const confirmText = $("confirm-text");
const confirmOk = $("confirm-ok");
const confirmCancel = $("confirm-cancel");

const connectionStatus = $("connection-status");
const connectionLabel = $("connection-label");

// --- Состояние ---
let unsubscribeMessages = null;
let unsubscribeConnection = null;
let unsubscribeTimeOffset = null;

let currentMessagesData = [];
let isLoading = true;
let errorTimeout = null;
let currentSort = loadSortState();
let serverTimeOffset = 0;

// ============================================================
// Словарь ошибок Firebase Auth → понятный русский текст
// ============================================================
const AUTH_ERRORS = {
    "auth/network-request-failed":
        "Проблемы с сетью. Проверьте подключение и попробуйте снова.",
    "auth/too-many-requests":
        "Слишком много попыток. Подождите немного и попробуйте снова.",
    "auth/user-disabled":
        "Этот аккаунт отключён в Firebase.",
    "auth/popup-blocked":
        "Браузер заблокировал всплывающее окно. Разрешите popup для этого сайта.",
    "auth/popup-closed-by-user":
        "Окно входа закрыто. Попробуйте снова.",
    "auth/cancelled-popup-request":
        "Запрос входа отменён другим запросом. Попробуйте снова.",
    "auth/account-exists-with-different-credential":
        "Аккаунт с этим email уже зарегистрирован через другого провайдера. " +
        "Войдите тем способом, которым регистрировались изначально.",
    "auth/operation-not-allowed":
        "Этот провайдер входа отключён в Firebase Console.",
    "auth/operation-not-supported-in-this-environment":
        "Вход не поддерживается в этом окружении браузера.",
    "auth/unauthorized-domain":
        "Домен не авторизован в Firebase Console → Authentication → Settings → Authorized domains. " +
        "Добавьте туда домен вашего GitHub Pages (например, username.github.io).",
    "auth/internal-error":
        "Внутренняя ошибка Firebase. Попробуйте позже.",
    "auth/invalid-api-key":
        "Неверный API-ключ Firebase. Проверьте конфигурацию.",
    "auth/quota-exceeded":
        "Превышена квота запросов к Firebase. Попробуйте позже.",
    "auth/user-token-expired":
        "Сессия истекла. Войдите заново.",
    "auth/requires-recent-login":
        "Требуется повторный вход для выполнения операции.",
    "auth/web-storage-unsupported":
        "Браузер блокирует storage. Разрешите cookies и localStorage для этого сайта.",
    "auth/invalid-credential":
        "Недействительные учётные данные. Попробуйте войти снова."
};

function authErrorMessage(error) {
    return AUTH_ERRORS[error.code] || `Ошибка входа [${error.code}]: ${error.message}`;
}

function dbErrorMessage(error) {
    switch (error.code) {
        case "PERMISSION_DENIED":
            return "Нет доступа к данным. Проверьте правила безопасности Firebase.";
        case "NETWORK_ERROR":
            return "Нет соединения с Realtime Database.";
        case "DISCONNECTED":
            return "Потеряно соединение с Realtime Database. Проверьте сеть.";
        default:
            return `Ошибка БД [${error.code || "unknown"}]: ${error.message}`;
    }
}

// ============================================================
// Баннер ошибок
// ============================================================
function showError(message) {
    errorText.textContent = message;
    errorBanner.classList.remove("hidden");
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => errorBanner.classList.add("hidden"), ERROR_TIMEOUT_MS);
}

errorClose?.addEventListener("click", () => {
    errorBanner.classList.add("hidden");
    clearTimeout(errorTimeout);
});

// ============================================================
// Модал подтверждения удаления (с фокус-трапом)
// ============================================================
function confirmAction(title, message) {
    return new Promise((resolve) => {
        confirmTitle.textContent = title;
        confirmText.textContent = message;
        confirmModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";

        const previousActive = document.activeElement;
        let resolved = false;
        const focusables = [confirmCancel, confirmOk];

        function cleanup() {
            confirmOk.removeEventListener("click", onOk);
            confirmCancel.removeEventListener("click", onCancel);
            confirmModal.removeEventListener("keydown", onKey);
            confirmModal.removeEventListener("click", onBackdrop);
            confirmModal.classList.add("hidden");
            document.body.style.overflow = "";
            previousActive?.focus?.();
        }

        function close(result) {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(result);
        }

        function onOk() { close(true); }
        function onCancel() { close(false); }

        function onKey(e) {
            if (e.key === "Escape") {
                e.preventDefault();
                close(false);
            } else if (e.key === "Tab") {
                const idx = focusables.indexOf(document.activeElement);
                if (e.shiftKey && idx <= 0) {
                    e.preventDefault();
                    focusables[focusables.length - 1].focus();
                } else if (!e.shiftKey && idx === focusables.length - 1) {
                    e.preventDefault();
                    focusables[0].focus();
                }
            }
        }

        function onBackdrop(e) {
            if (e.target === confirmModal) close(false);
        }

        confirmOk.addEventListener("click", onOk);
        confirmCancel.addEventListener("click", onCancel);
        confirmModal.addEventListener("keydown", onKey);
        confirmModal.addEventListener("click", onBackdrop);
        confirmCancel.focus();
    });
}

// ============================================================
// Мониторинг соединения с Firebase (.info/connected)
// ============================================================
function startConnectionMonitor() {
    if (unsubscribeConnection) return;

    const connRef = ref(database, PATHS.connected);
    unsubscribeConnection = onValue(connRef, (snapshot) => {
        updateConnectionUI(snapshot.val() === true);
    });

    const offsetRef = ref(database, PATHS.serverTimeOffset);
    unsubscribeTimeOffset = onValue(offsetRef, (snapshot) => {
        serverTimeOffset = Number(snapshot.val()) || 0;
    });
}

function stopConnectionMonitor() {
    if (unsubscribeConnection) {
        unsubscribeConnection();
        unsubscribeConnection = null;
    }
    if (unsubscribeTimeOffset) {
        unsubscribeTimeOffset();
        unsubscribeTimeOffset = null;
    }
    updateConnectionUI(false, true);
}

function updateConnectionUI(connected, idle = false) {
    if (!connectionStatus || !connectionLabel) return;
    connectionStatus.classList.remove("online", "offline", "idle");
    if (idle) {
        connectionStatus.classList.add("idle");
        connectionLabel.textContent = "Соединение…";
        connectionStatus.title = "Подключение к Firebase";
    } else if (connected) {
        connectionStatus.classList.add("online");
        connectionLabel.textContent = "Онлайн";
        connectionStatus.title = "Соединение с Firebase активно";
    } else {
        connectionStatus.classList.add("offline");
        connectionLabel.textContent = "Офлайн";
        connectionStatus.title =
            "Нет соединения с Firebase. Изменения синхронизируются при восстановлении связи.";
    }
}

// ============================================================
// Авторизация
// ============================================================
async function login(provider, providerName) {
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("Успешный вход:", providerName, result.user?.uid);
    } catch (error) {
        // Fallback на redirect для popup-специфичных ошибок
        if (
            error.code === "auth/popup-blocked" ||
            error.code === "auth/popup-closed-by-user" ||
            error.code === "auth/cancelled-popup-request" ||
            error.code === "auth/operation-not-supported-in-this-environment"
        ) {
            console.warn("Popup не сработал, переключаюсь на redirect:", error.code);
            try {
                await signInWithRedirect(auth, provider);
            } catch (redirectError) {
                console.error("Redirect error:", redirectError.code, redirectError.message);
                showError(authErrorMessage(redirectError));
            }
            return;
        }

        if (error.code === "auth/account-exists-with-different-credential") {
            const email = error.customData?.email || "";
            showError(
                `Аккаунт с email ${email || "(без email)"} уже существует через другого провайдера. ` +
                `Пожалуйста, войдите тем способом, которым регистрировались изначально.`
            );
            return;
        }

        console.error("Ошибка авторизации:", error.code, error.message);
        showError(authErrorMessage(error));
    }
}

// --- Обработка результата redirect ---
try {
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult?.user) {
        console.log("Вход через redirect успешен:", redirectResult.user.uid);
    }
} catch (error) {
    console.error("Redirect error:", error.code, error.message);
    showError(authErrorMessage(error));
}

// --- Слежение за состоянием авторизации ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.classList.add("hidden");
        appSection.classList.remove("hidden");

        userInfo.textContent = user.displayName || user.email || user.uid;
        userInfo.title = userInfo.textContent;

        if (user.photoURL) {
            userAvatar.onerror = () => userAvatar.classList.add("hidden");
            userAvatar.src = user.photoURL;
            userAvatar.alt = `Аватар ${user.displayName || "пользователя"}`;
            userAvatar.classList.remove("hidden");
        } else {
            userAvatar.removeAttribute("src");
            userAvatar.classList.add("hidden");
        }

        startConnectionMonitor();
        loadMessages(user.uid);
    } else {
        authSection.classList.remove("hidden");
        appSection.classList.add("hidden");
        userInfo.textContent = "";
        userInfo.title = "";
        userAvatar.removeAttribute("src");
        userAvatar.classList.add("hidden");
        messagesList.innerHTML = "";
        messagesCount.textContent = "";
        currentMessagesData = [];
        isLoading = true;

        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }
        stopConnectionMonitor();
    }
});

logoutBtn?.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Ошибка выхода:", error.code, error.message);
        showError(`Ошибка выхода: ${error.message}`);
    }
});

githubLoginBtn?.addEventListener("click", () => login(githubProvider, "GitHub"));
googleLoginBtn?.addEventListener("click", () => login(googleProvider, "Google"));

// ============================================================
// Состояние сортировки (с сохранением в localStorage)
// ============================================================
function loadSortState() {
    try {
        const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY));
        if (
            saved &&
            (saved.type === SORT.TIME || saved.type === SORT.TEXT) &&
            (saved.direction === SORT.ASC || saved.direction === SORT.DESC)
        ) {
            return saved;
        }
    } catch (_) { /* ignore */ }
    return { type: SORT.TIME, direction: SORT.DESC };
}

function saveSortState() {
    try {
        localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(currentSort));
    } catch (_) { /* ignore */ }
}

// ============================================================
// Отправка сообщения
// ============================================================
dataForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        showError("Сессия истекла. Войдите заново.");
        return;
    }

    const textValue = dataInput.value.trim();
    if (!textValue) return;
    if (textValue.length > MAX_TEXT_LENGTH) {
        showError(`Сообщение слишком длинное (максимум ${MAX_TEXT_LENGTH} символов).`);
        return;
    }

    submitBtn.disabled = true;
    dataInput.disabled = true;
    try {
        const userMessagesRef = ref(database, PATHS.messages(user.uid));
        const newMessageRef = push(userMessagesRef);
        await set(newMessageRef, {
            text: textValue,
            // serverTimestamp() подставляет серверное время.
            // Правила в Firebase проверяют, что timestamp — число и близко к now.
            timestamp: serverTimestamp()
        });
        dataInput.value = "";
        dataInput.focus();
    } catch (error) {
        console.error("Ошибка записи в БД:", error.code, error.message);
        showError(dbErrorMessage(error));
    } finally {
        submitBtn.disabled = false;
        dataInput.disabled = false;
    }
});

// ============================================================
// Удаление
// ============================================================
async function deleteMessage(uid, messageId, previewText) {
    const preview = previewText.length > 100 ? previewText.slice(0, 100) + "…" : previewText;
    const ok = await confirmAction("Удалить сообщение?", `«${preview}»`);
    if (!ok) return;

    try {
        const messageRef = ref(database, `${PATHS.messages(uid)}/${messageId}`);
        await remove(messageRef);
    } catch (error) {
        console.error("Ошибка удаления:", error.code, error.message);
        showError(dbErrorMessage(error));
    }
}

// ============================================================
// Сортировка
// ============================================================
sortTimeBtn?.addEventListener("click", () => {
    if (currentSort.type === SORT.TIME) {
        currentSort.direction = currentSort.direction === SORT.DESC ? SORT.ASC : SORT.DESC;
    } else {
        currentSort.type = SORT.TIME;
        currentSort.direction = SORT.DESC;
    }
    saveSortState();
    updateSortButtonsUI();
    renderMessages();
});

sortTextBtn?.addEventListener("click", () => {
    if (currentSort.type === SORT.TEXT) {
        currentSort.direction = currentSort.direction === SORT.ASC ? SORT.DESC : SORT.ASC;
    } else {
        currentSort.type = SORT.TEXT;
        currentSort.direction = SORT.ASC;
    }
    saveSortState();
    updateSortButtonsUI();
    renderMessages();
});

function updateSortButtonsUI() {
    const isTime = currentSort.type === SORT.TIME;
    const isText = currentSort.type === SORT.TEXT;

    sortTimeBtn.classList.toggle("active", isTime);
    sortTextBtn.classList.toggle("active", isText);
    sortTimeBtn.setAttribute("aria-pressed", String(isTime));
    sortTextBtn.setAttribute("aria-pressed", String(isText));

    sortTimeBtn.textContent = `Времени ${
        isTime ? (currentSort.direction === SORT.DESC ? "↓" : "↑") : "↓"
    }`;
    sortTextBtn.textContent = `Тексту ${
        isText ? (currentSort.direction === SORT.ASC ? "(А-Я)" : "(Я-А)") : "(А-Я)"
    }`;
}

// ============================================================
// Загрузка из БД
// ============================================================
function loadMessages(uid) {
    if (unsubscribeMessages) unsubscribeMessages();

    isLoading = true;
    renderMessages();

    const userMessagesRef = ref(database, PATHS.messages(uid));
    const recentQuery = query(userMessagesRef, limitToLast(MAX_MESSAGES));

    unsubscribeMessages = onValue(
        recentQuery,
        (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data === "object") {
                currentMessagesData = Object.entries(data).map(([key, value]) => ({
                    id: key,
                    text: typeof value?.text === "string" ? value.text : "",
                    timestamp:
                        typeof value?.timestamp === "number" && value.timestamp > 0
                            ? value.timestamp
                            : 0
                }));
            } else {
                currentMessagesData = [];
            }
            isLoading = false;
            renderMessages();
        },
        (error) => {
            isLoading = false;
            console.error("Ошибка чтения из БД:", error.code, error.message);
            showError(dbErrorMessage(error));
            renderMessages();
        }
    );
}

// ============================================================
// Стабильная сортировка
// ============================================================
function sortMessages(messages) {
    const sorted = [...messages];

    sorted.sort((a, b) => {
        let comparison = 0;

        if (currentSort.type === SORT.TIME) {
            comparison = a.timestamp - b.timestamp;
        } else if (currentSort.type === SORT.TEXT) {
            comparison = a.text.localeCompare(b.text, "ru", { sensitivity: "base" });
        }

        if (comparison === 0) {
            comparison = a.id.localeCompare(b.id);
        }

        return currentSort.direction === SORT.ASC ? comparison : -comparison;
    });

    return sorted;
}

// ============================================================
// Отрисовка
// ============================================================
function renderMessages() {
    messagesList.innerHTML = "";
    messagesList.setAttribute("aria-busy", String(isLoading));

    const count = currentMessagesData.length;
    messagesCount.textContent = count
        ? `(${count}${count >= MAX_MESSAGES ? "+, показаны последние" : ""})`
        : "";

    const sortDisabled = count < 2;
    sortTimeBtn.disabled = sortDisabled;
    sortTextBtn.disabled = sortDisabled;

    if (isLoading) {
        const li = document.createElement("li");
        li.className = "loading";
        li.textContent = "Загрузка…";
        messagesList.appendChild(li);
        return;
    }

    if (count === 0) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "Сообщений пока нет. Напишите первое!";
        messagesList.appendChild(li);
        return;
    }

    const sorted = sortMessages(currentMessagesData);
    const uid = auth.currentUser?.uid;
    const fragment = document.createDocumentFragment();

    sorted.forEach((msg) => {
        const li = document.createElement("li");

        const textDiv = document.createElement("div");
        textDiv.className = "msg-text-col";
        textDiv.textContent = msg.text;

        const timeDiv = document.createElement("div");
        timeDiv.className = "msg-time-col";
        if (msg.timestamp > 0) {
            const date = new Date(msg.timestamp);
            timeDiv.textContent =
                `${date.toLocaleDateString("ru-RU")} ` +
                date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
            timeDiv.title = date.toLocaleString("ru-RU");
        } else {
            timeDiv.textContent = "—";
        }

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "Удалить";
        deleteBtn.className = "delete-btn";
        const preview = msg.text.length > 50 ? msg.text.slice(0, 50) + "…" : msg.text;
        deleteBtn.setAttribute("aria-label", `Удалить сообщение: ${preview}`);
        deleteBtn.disabled = !uid;
        deleteBtn.addEventListener("click", () => {
            if (uid) deleteMessage(uid, msg.id, msg.text);
        });

        li.appendChild(textDiv);
        li.appendChild(timeDiv);
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });

    messagesList.appendChild(fragment);
}

// ============================================================
// Инициализация
// ============================================================
updateSortButtonsUI();
updateConnectionUI(false, true);

// Для отладки из консоли
window.__fbServerTimeOffset = () => serverTimeOffset;
