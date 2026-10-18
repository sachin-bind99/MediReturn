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
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error("MONGODB_URI is missing from the server environment");
    }

    const conn = await mongoose.connect(mongoUri, {
        dbName: "medireturn",
    });
    await ensureMedicineIndexes();
    console.log(
        `MongoDB connected: ${conn.connection.host}/${conn.connection.name}`
    );
    return conn;
};

export default connectDB;
