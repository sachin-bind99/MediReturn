import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import medicineRoutes from "./routes/medicineRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import returnRoutes from "./routes/returnRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
    path: path.join(serverDirectory, ".env")
});

const app = express();

app.use(cors());
app.use(express.json());

const healthCheck = (req, res) => {
    res.json({
        success: true,
        message: "MediReturn API is running"
    });
};

app.get("/", healthCheck);
app.get("/api/health", healthCheck);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/alerts", alertRoutes);
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error(
            "JWT_SECRET must contain at least 32 characters"
        );
    }

    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
});