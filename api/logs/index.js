const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient(process.env.COSMOS_CONNECTION);
const container = client
  .database(process.env.COSMOS_DATABASE)
  .container(process.env.COSMOS_CONTAINER);

module.exports = async function (context, req) {
  try {
    const { tenant, type } = req.query;

    if (!tenant || !type) {
      context.res = { status: 400, body: { error: 'tenant と type は必須です' } };
      return;
    }

    const { resources } = await container.items.query({
      query: 'SELECT * FROM c WHERE c.tenant = @tenant AND c.type = @type ORDER BY c._ts DESC',
      parameters: [
        { name: '@tenant', value: tenant },
        { name: '@type', value: type }
      ]
    }).fetchAll();

    context.res = { status: 200, body: resources };
  } catch (e) {
    context.res = { status: 500, body: { error: e.message } };
  }
};