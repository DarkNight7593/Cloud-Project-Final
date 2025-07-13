const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    let body = event.body;

    if (!body) {
      return {
        statusCode: 400,
        body: { error: 'Falta el body en la solicitud' }
      };
    }

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return {
          statusCode: 400,
          body: { error: 'El body no es un JSON válido' }
        };
      }
    }

    const { tenant_id, curso_id } = body;

    if (!token || !tenant_id || !curso_id) {
      return {
        statusCode: 400,
        body: { error: 'Faltan campos: token, tenant_id o curso_id' }
      };
    }

    // 1. Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ body: { token, tenant_id } })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode !== 200) {
      let errorMessage = 'Error al validar token';
      try {
        const parsed = JSON.parse(validarPayload.body);
        errorMessage = parsed.error || errorMessage;
      } catch {}
      return {
        statusCode: validarPayload.statusCode,
        body: { error: errorMessage }
      };
    }

    const user = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const { rol, dni } = user;

    if (rol !== 'alumno') {
      return {
        statusCode: 403,
        body: { error: 'Solo alumnos pueden eliminar sus compras' }
      };
    }

    const tenantCursoKey = `${tenant_id}#${curso_id}`;

    // 2. Buscar compra con el índice secundario
    const result = await dynamodb.query({
      TableName: TABLE_COMPRAS,
      IndexName: 'tenant_curso_index',
      KeyConditionExpression: 'tenant_id_curso_id = :pk AND alumno_dni = :dni',
      ExpressionAttributeValues: {
        ':pk': tenantCursoKey,
        ':dni': dni
      }
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: { error: 'No se encontró ninguna compra activa para este curso' }
      };
    }

    // 3. Determinar cuál estado eliminar
    const compra = result.Items.find(i => i.estado === 'inscrito') || result.Items.find(i => i.estado === 'reservado');

    if (!compra) {
      return {
        statusCode: 404,
        body: { error: 'No se encontró compra con estado válido (inscrito o reservado)' }
      };
    }

    // 4. Eliminar la compra
    await dynamodb.delete({
      TableName: TABLE_COMPRAS,
      Key: {
        tenant_id_dni_estado: compra.tenant_id_dni_estado,
        curso_id: compra.curso_id
      }
    }).promise();

    const mensaje = compra.estado === 'inscrito'
      ? 'Inscripción anulada'
      : 'Reserva anulada';

    return {
      statusCode: 200,
      body: { message: mensaje }
    };

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
