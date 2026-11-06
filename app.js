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

let unsubscribeMessages = null;

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
        // Формируем путь к конкретному сообщению
        const messageRef = ref(database, `messages/${userId}/${messageId}`);
        await remove(messageRef);
        // Перезагружать список не нужно, onValue сам заметит изменения и обновит экран
    } catch (error) {
        console.error("Ошибка удаления:", error);
        alert(`Не удалось удалить: ${error.message}`);
    }
}

// --- Выход ---
logoutBtn?.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Ошибка выхода:", error);
    }
});

// --- Кнопки входа ---
githubLoginBtn?.addEventListener("click", () => login(githubProvider));
googleLoginBtn?.addEventListener("click", () => login(googleProvider));

// --- Функция загрузки и отображения сообщений (Realtime) ---
function loadMessages(uid) {
    const userMessagesRef = ref(database, 'messages/' + uid);
    
    unsubscribeMessages = onValue(userMessagesRef, (snapshot) => {
        messagesList.innerHTML = ""; // Очищаем список перед обновлением
        const data = snapshot.val();
        
        if (data) {
            // Превращаем объект в массив пар [ключ, значение], чтобы не потерять ID сообщения
            const messagesArray = Object.entries(data).map(([key, value]) => {
                return { ...value, id: key }; // Сохраняем ключ в свойство id
            });

            // Сортируем по времени: новые сообщения сверху
            const sortedMessages = messagesArray.sort((a, b) => b.timestamp - a.timestamp);
            
            sortedMessages.forEach(msg => {
                const li = document.createElement("li");
                
                // Блок с текстом и датой
                const contentDiv = document.createElement("div");
                contentDiv.className = "msg-content";
                
                // Безопасный вывод текста (защита от XSS)
                const textNode = document.createTextNode(msg.text);
                const timeSpan = document.createElement("span");
                timeSpan.className = "msg-time";
                
                // Форматирование даты
                const date = new Date(msg.timestamp);
                const timeString = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const dateString = date.toLocaleDateString('ru-RU');
                timeSpan.textContent = `${dateString} в ${timeString}`;
                
                contentDiv.appendChild(textNode);
                contentDiv.appendChild(timeSpan);
                
                // Кнопка удаления
                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "Удалить";
                deleteBtn.className = "delete-btn";
                // Передаем msg.id, который мы извлекли выше
                deleteBtn.onclick = () => deleteMessage(uid, msg.id);
                
                li.appendChild(contentDiv);
                li.appendChild(deleteBtn);
                messagesList.appendChild(li);
            });
        } else {
            // Если сообщений нет
            const li = document.createElement("li");
            li.textContent = "Сообщений пока нет. Напишите первое!";
            li.style.color = "#777";
            li.style.fontStyle = "italic";
            li.style.textAlign = "center";
            li.style.display = "block"; // Сбрасываем flex для пустого сообщения
            messagesList.appendChild(li);
        }
    }, (error) => {
        console.error("Ошибка чтения из БД:", error);
    });
}
