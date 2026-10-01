const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health Check API
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "MediReturn API is running"
    });
});

// Server Port
const PORT = process.env.PORT || 5000;

// Start Server
app.listen(PORT, () => {
    console.log(`MediReturn server running on http://localhost:${PORT}`);
});