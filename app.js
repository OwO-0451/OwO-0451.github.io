import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    signOut,
    GithubAuthProvider,
    GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    set,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");
const googleProvider = new GoogleAuthProvider();

// --- DOM Элементы ---
const githubLoginBtn = document.getElementById("github-login-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
const dataForm = document.getElementById("data-form");
const dataInput = document.getElementById("data-input");
const messagesList = document.getElementById("messages-list");

// Кнопки сортировки
const sortTimeBtn = document.getElementById("sort-time-btn");
const sortTextBtn = document.getElementById("sort-text-btn");

// Переменные состояния
let unsubscribeMessages = null;
let currentMessagesData = []; // Здесь храним сырые данные для перерисовки при сортировке

// Текущее состояние сортировки
let currentSort = { type: 'time', direction: 'desc' }; // 'time' или 'text', 'asc' или 'desc'

// --- Функции авторизации ---
async function login(provider) {
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("Успех:", result.user);
    } catch (error) {
        if (
            error.code === "auth/popup-blocked" ||
            error.code === "auth/popup-closed-by-user" ||
            error.code === "auth/cancelled-popup-request" ||
            error.code === "auth/operation-not-supported-in-this-environment"
        ) {
            console.warn("Popup не сработал, переключаюсь на redirect:", error.code);
            await signInWithRedirect(auth, provider);
            return;
        }
        
        if (error.code === "auth/account-exists-with-different-credential") {
            alert(`Аккаунт с email ${error.customData.email} уже существует через другого провайдера.\nПожалуйста, войдите тем способом, которым регистрировались изначально.`);
            return;
        }

        console.error("Ошибка авторизации:", error.code, error.message, error);
        alert(`Ошибка [${error.code}]: ${error.message}`);
    }
}

getRedirectResult(auth).then((result) => {
    if (result?.user) console.log("Вход через redirect:", result.user);
}).catch((error) => {
    console.error("Redirect error:", error.code, error.message);
});

// Слежение за состоянием авторизации
onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.classList.add("hidden");
        appSection.classList.remove("hidden");
        userInfo.textContent = `Вы: ${user.displayName || user.email || user.uid}`;
        
        loadMessages(user.uid);
    } else {
        authSection.classList.remove("hidden");
        appSection.classList.add("hidden");
        userInfo.textContent = "";
        messagesList.innerHTML = "";
        currentMessagesData = [];
        
        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }
    }
});

// --- Отправка сообщения ---
dataForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const textValue = dataInput.value.trim();
    if (!textValue) return;

    try {
        const userMessagesRef = ref(database, 'messages/' + user.uid);
        const newMessageRef = push(userMessagesRef);
        await set(newMessageRef, {
            text: textValue,
            timestamp: Date.now()
        });
        dataInput.value = "";
    } catch (error) {
        console.error("Ошибка записи в БД:", error);
        alert(`Ошибка отправки: ${error.message}`);
    }
});

// --- Удаление сообщения ---
async function deleteMessage(userId, messageId) {
    if (!confirm("Вы уверены, что хотите удалить это сообщение?")) return;
    
    try {
        const messageRef = ref(database, `messages/${userId}/${messageId}`);
        await remove(messageRef);
    } catch (error) {
        console.error("Ошибка удаления:", error);
        alert(`Не удалось удалить: ${error.message}`);
    }
}

// --- Обработчики сортировки ---
sortTimeBtn?.addEventListener("click", () => {
    if (currentSort.type === 'time') {
        currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
        currentSort.type = 'time';
        currentSort.direction = 'desc';
    }
    updateSortButtonsUI();
    renderMessages();
});

sortTextBtn?.addEventListener("click", () => {
    if (currentSort.type === 'text') {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.type = 'text';
        currentSort.direction = 'asc';
    }
    updateSortButtonsUI();
    renderMessages();
});

function updateSortButtonsUI() {
    // Сброс классов
    sortTimeBtn.classList.remove("active");
    sortTextBtn.classList.remove("active");

    // Подсветка активной кнопки и обновление текста со стрелками
    if (currentSort.type === 'time') {
        sortTimeBtn.classList.add("active");
        sortTimeBtn.textContent = `Времени ${currentSort.direction === 'desc' ? '↓' : '↑'}`;
        sortTextBtn.textContent = "Тексту (А-Я)";
    } else {
        sortTextBtn.classList.add("active");
        sortTextBtn.textContent = `Тексту (${currentSort.direction === 'asc' ? 'А-Я' : 'Я-А'})`;
        sortTimeBtn.textContent = "Времени";
    }
}

logoutBtn?.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Ошибка выхода:", error);
    }
});

githubLoginBtn?.addEventListener("click", () => login(githubProvider));
googleLoginBtn?.addEventListener("click", () => login(googleProvider));

// --- Загрузка данных из БД ---
function loadMessages(uid) {
    const userMessagesRef = ref(database, 'messages/' + uid);
    
    unsubscribeMessages = onValue(userMessagesRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // Превращаем в массив и добавляем ID
            currentMessagesData = Object.entries(data).map(([key, value]) => {
                return { ...value, id: key };
            });
        } else {
            currentMessagesData = [];
        }
        
        // Вызываем рендер с учетом текущей сортировки
        renderMessages();
    }, (error) => {
        console.error("Ошибка чтения из БД:", error);
    });
}

// --- Отрисовка сообщений ---
function renderMessages() {
    messagesList.innerHTML = ""; 

    if (currentMessagesData.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Сообщений пока нет. Напишите первое!";
        li.style.color = "#777";
        li.style.fontStyle = "italic";
        li.style.textAlign = "center";
        li.style.display = "block";
        messagesList.appendChild(li);
        return;
    }

    // Копируем массив, чтобы не мутировать оригинал при сортировке
    let sorted = [...currentMessagesData];

    // Сортировка
    sorted.sort((a, b) => {
        let comparison = 0;
        
        if (currentSort.type === 'time') {
            comparison = a.timestamp - b.timestamp;
        } else if (currentSort.type === 'text') {
            comparison = a.text.localeCompare(b.text, 'ru', { sensitivity: 'base' });
        }
        
        // Инвертируем результат для убывания
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });

    // Отрисовка
    sorted.forEach(msg => {
        const li = document.createElement("li");
        
        // Колонка 1: Текст
        const textDiv = document.createElement("div");
        textDiv.className = "msg-text-col";
        textDiv.textContent = msg.text;
        
        // Колонка 2: Время
        const timeDiv = document.createElement("div");
        timeDiv.className = "msg-time-col";
        const date = new Date(msg.timestamp);
        timeDiv.textContent = `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        
        // Кнопка удаления
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Удалить";
        deleteBtn.className = "delete-btn";
        deleteBtn.onclick = () => deleteMessage(auth.currentUser.uid, msg.id);
        
        li.appendChild(textDiv);
        li.appendChild(timeDiv);
        li.appendChild(deleteBtn);
        messagesList.appendChild(li);
    });
}
