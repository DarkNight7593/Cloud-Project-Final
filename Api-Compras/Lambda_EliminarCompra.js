const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    let body = event.body;

    if (!body) return { statusCode: 400, body: { error: 'Falta el body en la solicitud' } };
    if (typeof body === 'string') body = JSON.parse(body);

    const { tenant_id, curso_id, horario_id } = body;
    if (!token || !tenant_id || !curso_id) {
      return { statusCode: 400, body: { error: 'Faltan campos: token, tenant_id o curso_id' } };
    }

    // 1. Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ body: { token, tenant_id } })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode !== 200) {
      const parsed = JSON.parse(validarPayload.body || '{}');
      return {
        statusCode: validarPayload.statusCode,
        body: { error: parsed.error || 'Error al validar token' }
      };
    }

    const user = typeof validarPayload.body === 'string' ? JSON.parse(validarPayload.body) : validarPayload.body;
    const { rol, dni } = user;
    const tenantCursoKey = `${tenant_id}#${curso_id}`;

    if (rol === 'alumno') {
      // Solo eliminar su compra
      const result = await dynamodb.query({
        TableName: TABLE_COMPRAS,
        IndexName: 'tenant_curso_index',
        KeyConditionExpression: 'tenant_id_curso_id = :pk AND alumno_dni = :dni',
        ExpressionAttributeValues: {
          ':pk': tenantCursoKey,
          ':dni': dni
        }
      }).promise();

      const compra = result.Items?.find(i => i.estado === 'inscrito') || result.Items?.find(i => i.estado === 'reservado');
      if (!compra) return { statusCode: 404, body: { error: 'No se encontró compra con estado válido' } };

      await dynamodb.delete({
        TableName: TABLE_COMPRAS,
        Key: {
          tenant_id_dni_estado: compra.tenant_id_dni_estado,
          curso_id: compra.curso_id
        }
      }).promise();

      return {
        statusCode: 200,
        body: { message: compra.estado === 'inscrito' ? 'Inscripción anulada' : 'Reserva anulada' }
      };
    }

    // Si es instructor o admin: eliminar TODAS las compras del horario
    if (rol === 'instructor' || rol === 'admin') {
      if (!horario_id) return { statusCode: 400, body: { error: 'Falta el horario_id para eliminación masiva' } };

      const result = await dynamodb.query({
        TableName: TABLE_COMPRAS,
        IndexName: 'tenant_curso_horario_index',
        KeyConditionExpression: 'tenant_id_curso_id = :pk AND horario_id = :hid',
        ExpressionAttributeValues: {
          ':pk': tenantCursoKey,
          ':hid': horario_id
        }
      }).promise();

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, body: { error: 'No se encontraron compras para este horario' } };
      }

      const eliminaciones = result.Items.map(i => dynamodb.delete({
        TableName: TABLE_COMPRAS,
        Key: {
          tenant_id_dni_estado: i.tenant_id_dni_estado,
          curso_id: i.curso_id
        }
      }).promise());

      await Promise.all(eliminaciones);

      return {
        statusCode: 200,
        body: { message: `${eliminaciones.length} compras eliminadas del horario` }
      };
    }

    return { statusCode: 403, body: { error: 'Rol no autorizado para esta operación' } };

  } catch (error) {
    console.error('Error al eliminar compra:', error);
    return {
      statusCode: 500,
      body: {
        error: 'Error interno del servidor',
        detalle: error.message
      }
    };
  }
};
