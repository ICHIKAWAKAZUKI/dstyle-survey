require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');

// トークン管理
const validTokens = new Set();

// ----------------------------------------------------
// 🔐 【認証】テナントごとのパスワード照合
// ----------------------------------------------------
app.http('auth', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { password, tenant } = await request.json();

            if (!tenant) {
                return {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { error: 'tenant は必須です' }
                };
            }

            const envKey = 'ADMIN_PASSWORD_' + tenant.toUpperCase().replace(/-/g, '_');
            const correctPW = process.env[envKey];

            if (!correctPW) {
                return {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { error: 'このテナントは設定されていません' }
                };
            }

            if (password === correctPW) {
                const token = crypto.randomBytes(16).toString('hex');
                validTokens.add(token);
                setTimeout(() => validTokens.delete(token), 24 * 60 * 60 * 1000);
                return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { token }
                };
            }

            return {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
                jsonBody: { error: 'パスワードが違います' }
            };

        } catch (e) {
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                jsonBody: { error: e.message }
            };
        }
    }
});

// ----------------------------------------------------
// 📅 【期間取得・保存】テナントごとの開始日・終了日
// ----------------------------------------------------
app.http('period', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const url = new URL(request.url);
            const client = new CosmosClient(process.env.COSMOS_CONNECTION);
            const container = client
                .database(process.env.COSMOS_DATABASE)
                .container(process.env.COSMOS_CONTAINER);

            // GET: 期間を取得
            if (request.method === 'GET') {
                const tenant = url.searchParams.get('tenant');
                if (!tenant) {
                    return {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { error: 'tenant は必須です' }
                    };
                }
                try {
                    const { resource } = await container.item('period_' + tenant, tenant).read();
                    return {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: {
                            startDate: resource ? resource.startDate : null,
                            endDate:   resource ? resource.endDate   : null
                        }
                    };
                } catch (e) {
                    return {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { startDate: null, endDate: null }
                    };
                }
            }

            // POST: 期間を保存（認証必要）
            if (request.method === 'POST') {
                const token = request.headers.get('x-admin-token');
                if (!token || !validTokens.has(token)) {
                    return {
                        status: 401,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { error: '認証が必要です' }
                    };
                }

                const body = await request.json().catch(() => ({}));
                const { tenant, startDate, endDate } = body;

                if (!tenant) {
                    return {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { error: 'tenant は必須です' }
                    };
                }

                await container.items.upsert({
                    id: 'period_' + tenant,
                    tenant,
                    startDate: startDate || null,
                    endDate:   endDate   || null,
                    updatedAt: new Date().toISOString()
                });

                return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { status: 'ok', startDate, endDate }
                };
            }

        } catch (e) {
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                jsonBody: { error: e.message }
            };
        }
    }
});

// ----------------------------------------------------
// 📦 【データ操作】保存・取得・削除
// ----------------------------------------------------
app.http('log', {
    methods: ['POST', 'GET', 'DELETE'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            if (request.method === 'GET' || request.method === 'DELETE') {
                const token = request.headers.get('x-admin-token');
                if (!token || !validTokens.has(token)) {
                    return {
                        status: 401,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { error: '認証が必要です' }
                    };
                }
            }

            const client = new CosmosClient(process.env.COSMOS_CONNECTION);
            const container = client
                .database(process.env.COSMOS_DATABASE)
                .container(process.env.COSMOS_CONTAINER);

            if (request.method === 'DELETE') {
                const url = new URL(request.url);
                const id = url.searchParams.get('id');
                const tenant = url.searchParams.get('tenant');

                if (!id || !tenant) {
                    return {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { error: 'id と tenant は必須です' }
                    };
                }

                await container.item(id, tenant).delete();

                return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { status: 'deleted' }
                };
            }

            if (request.method === 'GET') {
                const url = new URL(request.url);
                const tenant = url.searchParams.get('tenant');
                const type = url.searchParams.get('type');

                if (!tenant || !type) {
                    return {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                        jsonBody: { error: 'tenant と type の指定は必須です' }
                    };
                }

                const querySpec = {
                    query: "SELECT * FROM c WHERE c.tenant = @tenant AND c.type = @type",
                    parameters: [
                        { name: "@tenant", value: tenant },
                        { name: "@type", value: type }
                    ]
                };

                const { resources: items } = await container.items.query(querySpec).fetchAll();

                return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: items
                };
            }

            const body = await request.json() || {};
            const { tenant, type, data } = body;

            if (!tenant || !type) {
                return {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { error: 'tenant と type は必須です' }
                };
            }

            await container.items.create({
                id: crypto.randomUUID(),
                tenant,
                type,
                ...data,
                createdAt: new Date().toISOString()
            });

            return {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
                jsonBody: { status: 'ok' }
            };

        } catch (e) {
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                jsonBody: { error: e.message }
            };
        }
    }
});