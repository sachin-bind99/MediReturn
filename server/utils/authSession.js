import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import Session from "../models/Session.js";

export const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashSessionId = (sessionId) =>
    createHash("sha256").update(sessionId).digest("hex");

export const issueAccessToken = async (user) => {
    const sessionId = randomBytes(32).toString("hex");
    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + ACCESS_TOKEN_TTL_MS);

    await Session.create({
        user: user._id,
        jtiHash: hashSessionId(sessionId),
        expiresAt
    });

    return jwt.sign(
        {
            userId: String(user._id),
            tokenVersion: Number(user.tokenVersion || 0)
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d",
            jwtid: sessionId
        }
    );
};
