require('dotenv').config();
const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// HTMLファイルを配信（リポジトリルートのファイルを参照）
app.use(express.static(path.join(__dirname, '..')));

const validTokens = new Set();

// 認証
app.post('/api/auth', async (req, res) => {
    const { password, tenant } = req.body;
    if (!tenant) return res.status(400).json({ error: 'tenant は必須です' });
    const envKey = 'ADMIN_PASSWORD_' + tenant.toUpperCase().replace(/-/g, '_');
    const correctPW = process.env[envKey];
    if (!correctPW) return res.status(401).json({ error: 'このテナントは設定されていません' });
    if (password === correctPW) {
        const token = crypto.randomBytes(16).toString('hex');
        validTokens.add(token);
        setTimeout(() => validTokens.delete(token), 8 * 60 * 60 * 1000);
        return res.json({ token });
    }
    res.status(401).json({ error: 'パスワードが違います' });
});

// 期間取得・保存
app.get('/api/period', async (req, res) => {
    const { tenant } = req.query;
    if (!tenant) return res.status(400).json({ error: 'tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        const { resource } = await container.item('period_' + tenant, tenant).read();
        return res.json({
            startDate: resource ? resource.startDate : null,
            endDate:   resource ? resource.endDate   : null
        });
    } catch (e) {
        return res.json({ startDate: null, endDate: null });
    }
});

app.post('/api/period', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token))
        return res.status(401).json({ error: '認証が必要です' });
    const { tenant, startDate, endDate } = req.body;
    if (!tenant) return res.status(400).json({ error: 'tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        await container.items.upsert({
            id: 'period_' + tenant,
            tenant,
            startDate: startDate || null,
            endDate:   endDate   || null,
            updatedAt: new Date().toISOString()
        });
        return res.json({ status: 'ok', startDate, endDate });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// データ操作
app.all('/api/log', async (req, res) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
        const token = req.headers['x-admin-token'];
        if (!token || !validTokens.has(token))
            return res.status(401).json({ error: '認証が必要です' });
    }
    const client = new CosmosClient(process.env.COSMOS_CONNECTION);
    const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);

    if (req.method === 'DELETE') {
        const { id, tenant } = req.query;
        if (!id || !tenant) return res.status(400).json({ error: 'id と tenant は必須です' });
        await container.item(id, tenant).delete();
        return res.json({ status: 'deleted' });
    }
    if (req.method === 'GET') {
        const { tenant, type } = req.query;
        if (!tenant || !type) return res.status(400).json({ error: 'tenant と type の指定は必須です' });
        const { resources } = await container.items.query({
            query: "SELECT * FROM c WHERE c.tenant = @tenant AND c.type = @type",
            parameters: [{ name: "@tenant", value: tenant }, { name: "@type", value: type }]
        }).fetchAll();
        return res.json(resources);
    }
    const { tenant, type, data } = req.body;
    if (!tenant || !type) return res.status(400).json({ error: 'tenant と type は必須です' });
    await container.items.create({ id: crypto.randomUUID(), tenant, type, ...data, createdAt: new Date().toISOString() });
    res.status(201).json({ status: 'ok' });
});

app.listen(7071, () => {
    console.log('Local server running at http://localhost:7071');
    console.log('管理画面(Herbelle):   http://localhost:7071/admin-herbelle.html');
    console.log('管理画面(補正下着):   http://localhost:7071/admin-fitting.html');
    console.log('アンケート(Herbelle): http://localhost:7071/survey-herbelle.html');
    console.log('アンケート(補正下着): http://localhost:7071/survey-fitting.html');
});