import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { hashSessionId } from "../utils/authSession.js";

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (typeof authHeader !== "string") {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const [scheme, token, ...extraParts] = authHeader.split(/\s+/);
        if (scheme !== "Bearer" || !token || extraParts.length > 0) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (
            !decoded ||
            typeof decoded !== "object" ||
            typeof decoded.userId !== "string" ||
            !mongoose.isValidObjectId(decoded.userId) ||
            typeof decoded.jti !== "string" ||
            !/^[a-f0-9]{64}$/i.test(decoded.jti) ||
            !Number.isInteger(decoded.tokenVersion)
        ) {
            return res.status(401).json({
                message: "Invalid or expired token"
            });
        }

        const [user, session] = await Promise.all([
            User.findById(decoded.userId).select("+tokenVersion"),
            Session.findOne({
                user: decoded.userId,
                jtiHash: hashSessionId(decoded.jti),
                revokedAt: null,
                expiresAt: { $gt: new Date() }
            }).select("_id")
        ]);

        if (
            !user ||
            !session ||
            Number(user.tokenVersion || 0) !== decoded.tokenVersion
        ) {
            return res.status(401).json({
                message: "Invalid or expired token"
            });
        }

        req.userId = decoded.userId;
        req.authSessionId = session._id;
        return next();

    } catch (error) {
        if (
            !["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
                error.name
            )
        ) {
            return res.status(503).json({
                message: "Authentication service is temporarily unavailable"
            });
        }

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};

export default authMiddleware;
