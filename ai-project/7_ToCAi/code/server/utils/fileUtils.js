import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userImageDir = path.join(__dirname, '..', 'userImage');

/**
 * 将图片URL解析为base64数据
 * @param {string} imageUrl - 图片地址，如 http://localhost:3000/userImage/xxx.png
 * @returns {{mimeType: string, base64: string, dataUrl: string}} - 包含MIME类型、base64内容和dataUrl的对象
 */
export function parseImageToBase64(imageUrl) {
    try {
        const url = new URL(imageUrl);
        const pathname = url.pathname;

        if (!pathname.startsWith('/userImage/')) {
            throw new Error('无效的图片地址，路径必须以 /userImage/ 开头');
        }

        const filename = path.basename(pathname);
        if (!filename) {
            throw new Error('无法从URL中提取文件名');
        }

        const filePath = path.join(userImageDir, filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`图片文件不存在: ${filename}`);
        }

        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        const ext = path.extname(filename).toLowerCase();

        const mimeMap = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml'
        };
        const mimeType = mimeMap[ext] || 'image/png';

        return {
            mimeType,
            base64,
            dataUrl: `data:${mimeType};base64,${base64}`
        };
    } catch (error) {
        throw new Error(`解析图片失败: ${error.message}`);
    }
}
