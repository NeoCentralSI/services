import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export const gotenbergConfig = {
    url: process.env.GOTENBERG_URL || "http://localhost:3000",
};

export async function checkGotenbergConnection() {
    try {
        const response = await axios.get(`${gotenbergConfig.url}/health`);
        if (response.status === 200) {
            console.log("✅ Gotenberg connected successfully");
            return true;
        } else {
            throw new Error(`Gotenberg responded with status: ${response.status}`);
        }
    } catch (err) {
        console.error("❌ Gotenberg connection failed:", err.message);
        // Don't throw error to prevent server crash on startup if Gotenberg is optional, 
        // but if it's critical, you might want to. 
        // matching redis.js behavior (it throws).
        throw err;
    }
}

export default gotenbergConfig;
