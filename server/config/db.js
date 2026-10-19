import mongoose from "mongoose";
import Medicine from "../models/Medicine.js";

const ensureMedicineIndexes = async () => {
    try {
        await Medicine.collection.dropIndex("barcode_1");
    } catch (error) {
        // A fresh database or an already-migrated database has no old index.
        if (![26, 27].includes(error.code)) throw error;
    }

    await Medicine.createIndexes();
};

const connectDB = async () => {
    const isTest = process.env.NODE_ENV === "test";
    const mongoUri = isTest
        ? process.env.MONGODB_TEST_URI
        : process.env.MONGODB_URI;
    const dbName = isTest
        ? process.env.MONGODB_TEST_DB_NAME
        : process.env.MONGODB_DB_NAME || "medireturn";

    if (!mongoUri) {
        throw new Error(
            isTest
                ? "MONGODB_TEST_URI is required for test database connections"
                : "MONGODB_URI is missing from the server environment"
        );
    }

    if (
        isTest &&
        (!dbName || !/_test$/i.test(dbName) || dbName.toLowerCase() === "medireturn")
    ) {
        throw new Error(
            "MONGODB_TEST_DB_NAME must be an explicit database name ending in _test"
        );
    }

    const conn = await mongoose.connect(mongoUri, {
        dbName,
    });
    await ensureMedicineIndexes();
    console.log(
        `MongoDB connected: ${conn.connection.host}/${conn.connection.name}`
    );
    return conn;
};

export default connectDB;
