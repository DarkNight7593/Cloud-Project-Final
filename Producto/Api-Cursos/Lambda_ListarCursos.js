const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { limit = 5, lastKey, dni_instructor, tenant_id } = event.queryStringParameters || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
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
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    // Parsear lastKey para paginación
    const decodedLastKey = lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined;

    // Construir parámetros de consulta
    let params;
    if (dni_instructor) {
      params = {
        TableName: TABLE_CURSO,
        IndexName: 'tenant_instructor_index',
        KeyConditionExpression: 'tenant_id = :tenant_id AND instructor_dni = :dni',
        ExpressionAttributeValues: {
          ':tenant_id': tenant_id,
          ':dni': dni_instructor
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };
    } else {
      params = {
        TableName: TABLE_CURSO,
        KeyConditionExpression: 'tenant_id = :tenant_id',
        ExpressionAttributeValues: {
          ':tenant_id': tenant_id
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };
    }

    const result = await dynamodb.query(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        cursos: result.Items,
        paginacion: {
          siguienteToken: result.LastEvaluatedKey
            ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
            : null,
          total: result.Items.length
        }
      })
    };

  } catch (error) {
    console.error("Error al listar cursos:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        detalle: error.message
      })
    };
  }
};


