import fs from 'fs'
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_FILE = path.join(__dirname, 'last_messages.json');

// Load previous last message IDs
export function loadLastMessageTimes(): Record<string, string> {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
        }
    } catch (error) {
        console.error('Error loading last message times:', error);
    }
    return {};
}

// Save current last message IDs
export function saveLastMessageTimes(times: Record<string, string>) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(times, null, 2));
}