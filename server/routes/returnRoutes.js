import express from "express";

import {
    createReturn,
    getReturns,
    getReturnById,
    updateReturnStatus
} from "../controllers/returnController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ----------------------------------------
// RETURN ROUTES
// ----------------------------------------

router.post(
    "/",
    authMiddleware,
    createReturn
);

router.get(
    "/",
    authMiddleware,
    getReturns
);

router.get(
    "/:id",
    authMiddleware,
    getReturnById
);

router.patch(
    "/:id/status",
    authMiddleware,
    updateReturnStatus
);

export default router;