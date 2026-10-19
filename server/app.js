import express from "express";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import medicineRoutes from "./routes/medicineRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import returnRoutes from "./routes/returnRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";

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

app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/alerts", alertRoutes);

export default app;
