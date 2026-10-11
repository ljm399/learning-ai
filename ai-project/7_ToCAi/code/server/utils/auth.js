import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyToken } from './token.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersPath = path.join(__dirname, '..', 'jsondata', 'users.json');

function authMiddleware(req, res, next) {

    if (req.path === '/api/login') {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ code: 401, message: '缺少 authorization 请求头' });
    }
    try {
        //verifyToken-验证token，如果验证通过，则提取出里面的userid返回
        const payload = verifyToken(authHeader);
        req.userId = payload.userId;
        next();
    } catch (err) {
        return res.status(401).json({ code: 401, message: err.message });
    }
}

function loadUsers() {
    const data = fs.readFileSync(usersPath, 'utf-8');
    return JSON.parse(data);
}

export { authMiddleware, loadUsers };
