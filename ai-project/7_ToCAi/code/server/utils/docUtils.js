import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getSystemContext() {
    const filePath = path.resolve(__dirname, '../doc/system.md');
    return readFileSync(filePath, 'utf-8');
}
