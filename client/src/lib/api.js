import axios from "axios";
import {
  clearAuthToken,
  getAuthToken,
} from "./authSession.js";

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || "http://localhost:5000/api",
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    config.__authToken = token;

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    } else if (config.headers) {
      if (typeof config.headers.delete === "function") {
        config.headers.delete("Authorization");
      } else {
        delete config.headers.Authorization;
        delete config.headers.authorization;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const isPublicAuthRequest = (config) =>
  /\/auth\/(login|google|register|forgot-password|reset-password)$/.test(
    String(config?.url || "").split("?")[0],
  );

api.interceptors.response.use(
  (response) => {
    if (response.config?.__authToken !== getAuthToken()) {
      return Promise.reject(
        new axios.CanceledError("Authentication changed during this request"),
      );
    }

    return response;
  },
  (error) => {
    const config = error.config;

    if (config && config.__authToken !== getAuthToken()) {
      return Promise.reject(
        new axios.CanceledError("Authentication changed during this request"),
      );
    }

    if (
      error.response?.status === 401 &&
      config?.__authToken &&
      !isPublicAuthRequest(config)
    ) {
      clearAuthToken();
    }

    return Promise.reject(error);
  },
);

export default api;
