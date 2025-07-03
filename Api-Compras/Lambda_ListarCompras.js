const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const {
      tenant_id,
      curso_id,
      estado,
      limit = 10,
      lastCursoId,
      lastAlumnoDni
    } = event.queryStringParameters || {};

    if (!token || !tenant_id || !curso_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Se requieren token, tenant_id y curso_id' })
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
      let errorMessage = 'Error desconocido al validar token';
      try {
        const parsedBody = JSON.parse(validarPayload.body);
        errorMessage = parsedBody.error || errorMessage;
      } catch (_) {}
      return {
        statusCode,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const rol = usuario.rol;
    const dni = usuario.dni;
    const parsedLimit = parseInt(limit);

    // === ALUMNO ===
    if (rol === 'alumno') {
      if (!estado || !['reservado', 'inscrito'].includes(estado)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Estado requerido o inválido' })
        };
      }

      const partitionKey = `${tenant_id}#${dni}#${estado}`;
      let keyCondition = 'tenant_id_dni_estado = :pk';
      const expressionValues = { ':pk': partitionKey };

      if (lastCursoId) {
        keyCondition += ' AND curso_id > :lastCursoId';
        expressionValues[':lastCursoId'] = lastCursoId;
      }

      const result = await dynamodb.query({
        TableName: TABLE_COMPRAS,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        Limit: parsedLimit
      }).promise();

      return {
        statusCode: 200,
        body: JSON.stringify({
          compras: result.Items,
          paginacion: {
            siguienteCursoId: result.Items.length > 0
              ? result.Items[result.Items.length - 1].curso_id
              : null,
            total: result.Items.length
          }
        })
      };
    }

    // === INSTRUCTOR o ADMIN ===
    if (rol === 'instructor' || rol === 'admin') {
      const partitionKey = `${tenant_id}#${curso_id}`;
      let keyCondition = 'tenant_id_curso_id = :pk';
      const expressionValues = { ':pk': partitionKey };

      if (lastAlumnoDni) {
        keyCondition += ' AND alumno_dni > :lastAlumnoDni';
        expressionValues[':lastAlumnoDni'] = lastAlumnoDni;
      }

      const result = await dynamodb.query({
        TableName: TABLE_COMPRAS,
        IndexName: 'tenant_curso_index',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        Limit: parsedLimit
      }).promise();

      return {
        statusCode: 200,
        body: JSON.stringify({
          compras: result.Items,
          paginacion: {
            siguienteAlumnoDni: result.Items.length > 0
              ? result.Items[result.Items.length - 1].alumno_dni
              : null,
            total: result.Items.length
          }
        })
      };
    }

    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Rol no autorizado' })
    };

  } catch (error) {
    console.error('Error en listar compras:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno', detalle: error.message })
    };
  }
};



