// Keep logout consistent across desktop/mobile, including failed network calls.
const LOGGED_OUT_KEY = 'pm2_logged_out';

// Remove credentials left by versions that stored Base64(account:password).
localStorage.removeItem('pm2_creds');

export function setRememberMe(remember) {
    localStorage.setItem('pm2_remember_me', String(Boolean(remember)));
}

// Both the SDK and the manual session fallback must use the same storage.
export const authStorage = {
    getItem(key) {
        return sessionStorage.getItem(key) ?? localStorage.getItem(key);
    },
    setItem(key, value) {
        const remember = localStorage.getItem('pm2_remember_me') !== 'false';
        const target = remember ? localStorage : sessionStorage;
        const other = remember ? sessionStorage : localStorage;
        other.removeItem(key);
        target.setItem(key, value);
    },
    removeItem(key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    }
};

export function wasExplicitlyLoggedOut() {
    return localStorage.getItem(LOGGED_OUT_KEY) === 'true';
}

export function markSignedIn() {
    localStorage.removeItem(LOGGED_OUT_KEY);
}

export async function signOutLocally(client) {
    // Block restoration immediately, even if the SDK's network request fails.
    localStorage.setItem(LOGGED_OUT_KEY, 'true');
    localStorage.removeItem('pm2_session');
    localStorage.removeItem('pm2_creds');
    try {
        if (client) await client.auth.signOut({ scope: 'local' });
    } catch (err) {
        console.warn('登出请求未完成，仍将清除本地登录状态');
    } finally {
        for (const storage of [localStorage, sessionStorage]) {
            const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
            for (const key of keys) {
                if (['pm2_session', 'pm2_creds', 'intimate_unlocked'].includes(key) ||
                    /^sb-.*-auth-token(?:$|-)/.test(key)) {
                    storage.removeItem(key);
                }
            }
        }
        if (typeof caches !== 'undefined') {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.filter(key => /^photo-(api|images|manager)-/.test(key))
                    .map(key => caches.delete(key)));
            } catch (err) {
                console.warn('本地离线缓存清理失败');
            }
        }
    }
}
