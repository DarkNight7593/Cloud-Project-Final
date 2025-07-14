const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_ELIMINAR_COMPRAS = process.env.FUNCION_ELIMINAR_COMPRAS;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    let body = event.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const { tenant_id, horario_id } = body || {};
    if (!token || !tenant_id) return { statusCode: 404, body: { error: 'Token o tenant_id no proporcionado' } };
    if (!horario_id) return { statusCode: 400, body: { error: 'Falta el campo horario_id' } };

    // Validar token
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

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const { rol } = usuario;

    // Buscar horario para obtener la clave completa
    const result = await dynamodb.query({
      TableName: TABLE_HORARIO,
      IndexName: 'tenant_horario_index',
      KeyConditionExpression: 'tenant_id = :tenant AND horario_id = :horario',
      ExpressionAttributeValues: {
        ':tenant': tenant_id,
        ':horario': horario_id
      },
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: { error: 'Horario no encontrado' }
      };
    }

    const horario = result.Items[0];
    const { tenant_id_curso_id, horario_id: hid } = horario;

    // 1. Eliminar el horario
    await dynamodb.delete({
      TableName: TABLE_HORARIO,
      Key: { tenant_id_curso_id, horario_id: hid }
    }).promise();

    // 2. Si es admin o instructor: invocar eliminación de compras
    if (rol === 'admin' || rol === 'instructor') {
      try {
        await lambda.invoke({
          FunctionName: FUNCION_ELIMINAR_COMPRAS,
          InvocationType: 'Event', // invocación asíncrona
          Payload: JSON.stringify({
            headers: { Authorization: token },
            body: {
              tenant_id,
              curso_id: tenant_id_curso_id.split('#')[1],
              horario_id: hid
            }
          })
        }).promise();
        console.log(`🧹 Compras en horario ${hid} serán eliminadas.`);
      } catch (err) {
        console.error('⚠️ No se pudo invocar eliminación de compras:', err.message);
        // no cortar el flujo, se sigue
      }
    }

    return {
      statusCode: 200,
      body: { message: 'Horario eliminado exitosamente' }
    };

  } catch (error) {
    console.error('Error al eliminar horario:', error);
    return {
      statusCode: 500,
      body: { error: 'Error interno', detalle: error.message }
    };
  }
};
