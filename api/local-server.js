require('dotenv').config();
const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
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
        setTimeout(() => validTokens.delete(token), 24 * 60 * 60 * 1000);
        return res.json({ token });
    }
    res.status(401).json({ error: 'パスワードが違います' });
});

// 期間取得・保存
app.get('/api/period', async (req, res) => {
    const { tenant, surveyId } = req.query;
    if (!tenant && !surveyId) return res.status(400).json({ error: 'tenant または surveyId は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        const id = surveyId ? 'period_survey_' + surveyId : 'period_' + tenant;
        const pk = surveyId ? 'survey_period' : tenant;
        const { resource } = await container.item(id, pk).read();
        return res.json({ startDate: resource ? resource.startDate : null, endDate: resource ? resource.endDate : null });
    } catch (e) {
        return res.json({ startDate: null, endDate: null });
    }
});

app.post('/api/period', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
    const { tenant, surveyId, startDate, endDate } = req.body;
    if (!tenant && !surveyId) return res.status(400).json({ error: 'tenant または surveyId は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        const id = surveyId ? 'period_survey_' + surveyId : 'period_' + tenant;
        const pk = surveyId ? 'survey_period' : tenant;
        await container.items.upsert({ id, tenant: pk, startDate: startDate || null, endDate: endDate || null, updatedAt: new Date().toISOString() });
        return res.json({ status: 'ok', startDate, endDate });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// アンケート定義 CRUD
app.get('/api/surveys', async (req, res) => {
    const { tenant, id } = req.query;
    if (!tenant) return res.status(400).json({ error: 'tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        if (id) {
            const { resource } = await container.item(id, tenant).read();
            return res.json(resource);
        }
        const { resources } = await container.items.query({
            query: "SELECT * FROM c WHERE c.tenant = @tenant AND c.docType = 'survey_definition' ORDER BY c.createdAt DESC",
            parameters: [{ name: "@tenant", value: tenant }]
        }).fetchAll();
        return res.json(resources);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/surveys', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
    const { tenant, title, description, questions } = req.body;
    if (!tenant || !title) return res.status(400).json({ error: 'tenant と title は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        const newSurvey = {
            id: 'survey_' + crypto.randomUUID(),
            docType: 'survey_definition',
            tenant, title, description: description || '',
            questions: questions || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await container.items.create(newSurvey);
        return res.status(201).json(newSurvey);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.put('/api/surveys', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
    const { id, tenant, title, description, questions } = req.body;
    if (!id || !tenant) return res.status(400).json({ error: 'id と tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        const { resource: existing } = await container.item(id, tenant).read();
        const updated = { ...existing, title: title ?? existing.title, description: description ?? existing.description, questions: questions ?? existing.questions, updatedAt: new Date().toISOString() };
        await container.items.upsert(updated);
        return res.json(updated);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.delete('/api/surveys', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
    const { id, tenant } = req.query;
    if (!id || !tenant) return res.status(400).json({ error: 'id と tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        await container.item(id, tenant).delete();
        return res.json({ status: 'deleted' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 回答データ
app.post('/api/response', async (req, res) => {
    const { surveyId, tenant, answers } = req.body;
    if (!surveyId || !tenant || !answers) return res.status(400).json({ error: 'surveyId, tenant, answers は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        await container.items.create({ id: crypto.randomUUID(), docType: 'survey_response', surveyId, tenant, answers, createdAt: new Date().toISOString() });
        return res.status(201).json({ status: 'ok' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/response', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
    const { surveyId, tenant } = req.query;
    if (!surveyId || !tenant) return res.status(400).json({ error: 'surveyId と tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        const { resources } = await container.items.query({
            query: "SELECT * FROM c WHERE c.tenant = @tenant AND c.surveyId = @surveyId AND c.docType = 'survey_response' ORDER BY c.createdAt DESC",
            parameters: [{ name: "@tenant", value: tenant }, { name: "@surveyId", value: surveyId }]
        }).fetchAll();
        return res.json(resources);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.delete('/api/response', async (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
    const { id, tenant } = req.query;
    if (!id || !tenant) return res.status(400).json({ error: 'id と tenant は必須です' });
    try {
        const client = new CosmosClient(process.env.COSMOS_CONNECTION);
        const container = client.database(process.env.COSMOS_DATABASE).container(process.env.COSMOS_CONTAINER);
        await container.item(id, tenant).delete();
        return res.json({ status: 'deleted' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 既存ログ互換
app.all('/api/log', async (req, res) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
        const token = req.headers['x-admin-token'];
        if (!token || !validTokens.has(token)) return res.status(401).json({ error: '認証が必要です' });
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
    console.log('ポータル:               http://localhost:7071/index.html');
    console.log('Herbelleダッシュボード: http://localhost:7071/dashboard-herbelle.html');
    console.log('Dianaダッシュボード:    http://localhost:7071/dashboard-diana.html');
    console.log('アンケート(動的):       http://localhost:7071/survey.html?id=xxx&tenant=yyy');
    console.log('管理画面(Herbelle):    http://localhost:7071/admin-herbelle.html');
    console.log('管理画面(補正下着):    http://localhost:7071/admin-fitting.html');
});