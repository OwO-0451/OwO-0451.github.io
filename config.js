import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GithubAuthProvider, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

export const auth = getAuth(app);
export const database = getDatabase(app);

export const githubProvider = new GithubAuthProvider();
export const googleProvider = new GoogleAuthProvider();

auth.useDeviceLanguage();
