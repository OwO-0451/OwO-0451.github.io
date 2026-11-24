import { auth, githubProvider, googleProvider } from "./config.js";
import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export async function login(provider) {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (
            error.code === "auth/popup-blocked" ||
            error.code === "auth/popup-closed-by-user" ||
            error.code === "auth/cancelled-popup-request"
        ) {
            await signInWithRedirect(auth, provider);
            return;
        }
        throw error;
    }
}

export async function logout() {
    await signOut(auth);
}

export async function checkRedirectResult() {
    try {
        const result = await getRedirectResult(auth);
        return result?.user || null;
    } catch (error) {
        console.error("Redirect error:", error);
        return null;
    }
}

export function subscribeToAuth(callback) {
    return onAuthStateChanged(auth, callback);
}

export { githubProvider, googleProvider };
