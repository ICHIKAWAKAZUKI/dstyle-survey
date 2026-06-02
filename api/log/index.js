const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (context, req) {
  try {
    const client = new CosmosClient(process.env.COSMOS_CONNECTION);
    const container = client
      .database(process.env.COSMOS_DATABASE)
      .container(process.env.COSMOS_CONTAINER);

    const body = req.body || {};
    const { tenant, type, data } = body;

    if (!tenant || !type) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'tenant と type は必須です' })
      };
      return;
    }

    await container.items.create({
      id: require('crypto').randomUUID(),
      tenant,
      type,
      ...data,
      createdAt: new Date().toISOString()
    });

    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ok' })
    };
  } catch (e) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};