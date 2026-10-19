const TOKEN_KEY = "token";
const subscribers = new Set();
let listeningForStorage = false;

const notifySubscribers = () => {
  for (const subscriber of subscribers) {
    subscriber();
  }
};

const handleStorageChange = (event) => {
  if (event.key === TOKEN_KEY || event.key === null) {
    notifySubscribers();
  }
};

export const getAuthToken = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
};

export const subscribeToAuthToken = (subscriber) => {
  subscribers.add(subscriber);

  if (!listeningForStorage && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageChange);
    listeningForStorage = true;
  }

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && listeningForStorage && typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorageChange);
      listeningForStorage = false;
    }
  };
};

export const setAuthToken = (token) => {
  if (typeof window === "undefined" || typeof token !== "string" || !token) {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
  notifySubscribers();
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  notifySubscribers();
};
