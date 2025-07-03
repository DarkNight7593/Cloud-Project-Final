const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id, estado, limit = 10, lastKey } = event.queryStringParameters || {};

    if (!token || !tenant_id || !curso_id || !estado) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Se requieren token, tenant_id, curso_id y estado' })
      };
    }

    // Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ body: { token, tenant_id } })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode !== 200) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido o expirado' }) };
    }

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const rol = usuario.rol;
    const dni = usuario.dni;
    const decodedLastKey = lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined;
    const partitionKey = `${tenant_id}#${curso_id}`;
    const estadoSuffix = `#${estado}`;

    if (rol === 'alumno') {
      // Solo puede ver sus propias compras
      const sortKey = `${dni}${estadoSuffix}`;
      const params = {
        TableName: TABLE_COMPRAS,
        KeyConditionExpression: 'tenant_id_curso_id = :pk AND dni_estado = :sk',
        ExpressionAttributeValues: {
          ':pk': partitionKey,
          ':sk': sortKey
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };

      const result = await dynamodb.query(params).promise();

      return {
        statusCode: 200,
        body: JSON.stringify({
          compras: result.Items,
          lastKey: result.LastEvaluatedKey
            ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
            : null
        })
      };

    } else {
      // Admin u otro rol: puede ver todos los del curso con ese estado
      const params = {
        TableName: TABLE_COMPRAS,
        KeyConditionExpression: 'tenant_id_curso_id = :pk',
        FilterExpression: 'contains(dni_estado, :estado)',
        ExpressionAttributeValues: {
          ':pk': partitionKey,
          ':estado': estadoSuffix
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };

      const result = await dynamodb.query(params).promise();

      return {
        statusCode: 200,
        body: JSON.stringify({
          compras: result.Items,
          lastKey: result.LastEvaluatedKey
            ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
            : null
        })
      };
    }

  } catch (error) {
    console.error('Error en listar compras:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno', detalle: error.message })
    };
  }
};


