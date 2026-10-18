import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
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
            !mongoose.isValidObjectId(decoded.userId)
        ) {
            return res.status(401).json({
                message: "Invalid or expired token"
            });
        }

        req.userId = decoded.userId;
        return next();

    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};

export default authMiddleware;
