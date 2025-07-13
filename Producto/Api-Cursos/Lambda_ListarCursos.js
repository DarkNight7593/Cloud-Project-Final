const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const {
      limit = 5,
      lastCursoId,
      dni_instructor,
      tenant_id
    } = event.query || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 401,
        body: { error: 'Token o tenant_id no proporcionado' }
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
      let statusCode = validarPayload.statusCode;
      let errorMessage = 'Error al validar token';
      const parsedBody = typeof validarPayload.body === 'string'
        ? JSON.parse(validarPayload.body)
        : validarPayload.body;
      errorMessage = parsedBody.error || errorMessage;
      return {
        statusCode,
        body: { error: errorMessage }
      };
    }

    const parsedLimit = parseInt(limit);

    let result;

    if (dni_instructor) {
      const tenantInstructor = `${tenant_id}#${dni_instructor}`;

      let keyCondition = 'tenant_instructor = :tenantInstructor';
      let expressionValues = { ':tenantInstructor': tenantInstructor };

      if (lastCursoId) {
        keyCondition += ' AND curso_id > :lastCursoId';
        expressionValues[':lastCursoId'] = lastCursoId;
      }

      const params = {
        TableName: TABLE_CURSO,
        IndexName: 'tenant_instructor_index',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        Limit: parsedLimit
      };

      result = await dynamodb.query(params).promise();

    } else {
      let keyCondition = 'tenant_id = :tenant_id';
      let expressionValues = { ':tenant_id': tenant_id };

      if (lastCursoId) {
        keyCondition += ' AND curso_id > :lastCursoId';
        expressionValues[':lastCursoId'] = lastCursoId;
      }

      const params = {
        TableName: TABLE_CURSO,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        Limit: parsedLimit
      };

      result = await dynamodb.query(params).promise();
    }

    return {
      statusCode: 200,
      body: {
        cursos: result.Items,
        paginacion: {
          ultimoCursoId: result.Items.length > 0
            ? result.Items[result.Items.length - 1].curso_id
            : null,
          total: result.Items.length
        }
      }
    };

  } catch (error) {
    console.error("Error al listar cursos:", error);
    return {
      statusCode: 500,
      body: {
        error: 'Error interno del servidor',
        detalle: error.message
      }
    };
  }
};
