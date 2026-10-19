import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
    path: path.join(serverDirectory, ".env")
});

// ESM evaluates static imports before this module body. Load the server
// environment first, then import modules that may read it during evaluation.
const [{ default: connectDB }, { default: app }] = await Promise.all([
    import("./config/db.js"),
    import("./app.js"),
]);

const PORT = process.env.PORT || 5000;

export const startServer = async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error("JWT_SECRET must contain at least 32 characters");
    }

    await connectDB();

    return app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

const isDirectExecution =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
    startServer().catch((error) => {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    });
}
