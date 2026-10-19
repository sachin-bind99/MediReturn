import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import api from "./api.js";
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  subscribeToAuthToken,
} from "./authSession.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const createBrowserStub = () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  target.localStorage = storage;
  return { storage, target };
};

test("same-tab login, account switching, and logout notify route subscribers", () => {
  const previousWindow = globalThis.window;
  const { target } = createBrowserStub();
  globalThis.window = target;
  let notifications = 0;
  const unsubscribe = subscribeToAuthToken(() => notifications++);

  try {
    setAuthToken("owner-a-session");
    assert.equal(getAuthToken(), "owner-a-session");
    setAuthToken("owner-b-session");
    assert.equal(getAuthToken(), "owner-b-session");
    clearAuthToken();
    assert.equal(getAuthToken(), null);
    assert.equal(notifications, 3);
  } finally {
    unsubscribe();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("auth store detects cross-tab token changes", () => {
  const previousWindow = globalThis.window;
  const { storage, target } = createBrowserStub();
  globalThis.window = target;
  let notifications = 0;
  const unsubscribe = subscribeToAuthToken(() => notifications++);

  try {
    storage.setItem("token", "owner-b-session");
    const event = new Event("storage");
    Object.defineProperty(event, "key", { value: "token" });
    target.dispatchEvent(event);

    assert.equal(getAuthToken(), "owner-b-session");
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
    clearAuthToken();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("a response started with an old account token is discarded", async () => {
  const previousWindow = globalThis.window;
  const { target } = createBrowserStub();
  globalThis.window = target;
  const previousAdapter = api.defaults.adapter;
  let finishRequest;
  const pendingAdapter = new Promise((resolve) => {
    finishRequest = resolve;
  });

  api.defaults.adapter = async (config) => {
    await pendingAdapter;
    return {
      data: { owner: "owner-a" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };

  try {
    setAuthToken("owner-a-session");
    const request = api.get("/test/stale-response");
    await new Promise((resolve) => setTimeout(resolve, 0));
    setAuthToken("owner-b-session");
    finishRequest();

    await assert.rejects(request, (error) => axios.isCancel(error));
  } finally {
    api.defaults.adapter = previousAdapter;
    clearAuthToken();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("a protected 401 clears the current browser token", async () => {
  const previousWindow = globalThis.window;
  const { target } = createBrowserStub();
  globalThis.window = target;
  const previousAdapter = api.defaults.adapter;

  api.defaults.adapter = async (config) => {
    const response = {
      data: { message: "Invalid or expired token" },
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      config,
    };
    throw new axios.AxiosError(
      "Unauthorized",
      "ERR_BAD_REQUEST",
      config,
      null,
      response,
    );
  };

  try {
    setAuthToken("invalid-session");
    await assert.rejects(api.get("/protected/resource"));
    assert.equal(getAuthToken(), null);
  } finally {
    api.defaults.adapter = previousAdapter;
    clearAuthToken();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
