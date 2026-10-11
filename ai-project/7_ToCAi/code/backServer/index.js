const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 5000;

app.use(express.json());

function loadGoods() {
    const data = fs.readFileSync(path.join(__dirname, 'goods.json'), 'utf-8');
    return JSON.parse(data);
}

function loadOrders() {
    const data = fs.readFileSync(path.join(__dirname, 'order.json'), 'utf-8');
    return JSON.parse(data);
}

function normalize(text) {
    return String(text).toLowerCase().replace(/\s+/g, '');
}

function matchAny(text, keywords) {
    const nt = normalize(text);
    return keywords.some(k => k && nt.includes(normalize(k)));
}

app.get('/search', (req, res) => {
    const { type } = req.query;
    const goods = loadGoods();

    const typeKeywords = type ? type.split(/[,，|/\s]+/).filter(Boolean) : [];

    const results = goods.filter(item => {
        const text = item.title + ' ' + item.description;
        return typeKeywords.length === 0 || matchAny(text, typeKeywords);
    });

    res.json({
        query: { type },
        count: results.length,
        data: results
    });
});

//orders接口，接受一个日期，筛选出，这个日期之后的订单。
app.get('/orders', (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ error: 'Missing required query parameter: date' });
    }

    const threshold = new Date(Number(date));
    if (isNaN(threshold.getTime())) {
        return res.status(400).json({ error: 'Invalid date timestamp' });
    }

    const orders = loadOrders();
    const results = orders.filter(order => new Date(order.orderDate) > threshold);

    res.json({
        query: { date: threshold.toISOString() },
        count: results.length,
        data: results
    });
});
//直接退货
app.post('/return', (req, res) => {
    const { productId } = req.body;
    if (!productId) {
        return res.status(400).json({ error: 'Missing required field: productId' });
    }
    res.json({ success: true, productId });
});
//申请退货
app.post('/applyreturn', (req, res) => {
    const { productId } = req.body;
    if (!productId) {
        return res.status(400).json({ error: 'Missing required field: productId' });
    }
    res.json({ success: true, productId });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
