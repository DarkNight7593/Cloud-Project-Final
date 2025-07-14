const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_ACTUALIZAR_COMPRA = process.env.FUNCION_ACTUALIZAR_COMPRA;

function diasChocan(d1, d2) {
  return d1.some(d => d2.includes(d));
}

function horariosChocan(i1, f1, i2, f2) {
  return i1 < f2 && f1 > i2;
}

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    let body = event.body;

    if (typeof body === 'string') body = JSON.parse(body);
    const { tenant_id, horario_id } = body;

    if (!token || !tenant_id || !horario_id) {
      return {
        statusCode: 400,
        body: { error: 'Faltan token, tenant_id o horario_id' }
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
      try {
        const parsed = typeof validarPayload.body === 'string'
          ? JSON.parse(validarPayload.body)
          : validarPayload.body;
        errorMessage = parsed.error || errorMessage;
      } catch (_) {}
      return {
        statusCode,
        body: { error: errorMessage }
      };
    }

    // Buscar horario actual
    const result = await dynamodb.query({
      TableName: TABLE_HORARIO,
      IndexName: 'tenant_horario_index',
      KeyConditionExpression: 'tenant_id = :t AND horario_id = :h',
      ExpressionAttributeValues: {
        ':t': tenant_id,
        ':h': horario_id
      },
      Limit: 1
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: { error: 'El horario no existe' }
      };
    }

    const existing = result.Items[0];
    const tenant_id_curso_id = existing.tenant_id_curso_id;

    // Usar datos existentes si no vienen nuevos
    const dias = body.dias ?? existing.dias;
    const inicio_hora = body.inicio_hora ?? existing.inicio_hora;
    const fin_hora = body.fin_hora ?? existing.fin_hora;

    // Verificar colisión con otros horarios del curso
    const horarios = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :pk',
      ExpressionAttributeValues: {
        ':pk': tenant_id_curso_id
      }
    }).promise();

    const hayChoque = horarios.Items.find(h =>
      h.horario_id !== horario_id &&
      diasChocan(dias, h.dias) &&
      horariosChocan(inicio_hora, fin_hora, h.inicio_hora, h.fin_hora)
    );

    if (hayChoque) {
      return {
        statusCode: 409,
        body: { error: 'Existe choque de horario en al menos un día' }
      };
    }

    // Actualizar el horario
    const item = {
      tenant_id,
      tenant_id_curso_id,
      horario_id,
      dias,
      inicio_hora,
      fin_hora
    };

    await dynamodb.put({
      TableName: TABLE_HORARIO,
      Item: item
    }).promise();

    // 🔄 Invocar Lambda de actualización de compras (no espera respuesta)
    try {
      await lambda.invoke({
        FunctionName: FUNCION_ACTUALIZAR_COMPRA,
        InvocationType: 'Event', // asincrónico
        Payload: JSON.stringify({
          headers: { Authorization: token },
          query: { tenant_id, curso_id: tenant_id_curso_id.split('#')[1], horario_id }
        })
      }).promise();
    } catch (e) {
      console.warn('⚠️ Error al invocar actualizarCompras desde horario:', e.message);
    }

    return {
      statusCode: 200,
      body: {
        message: 'Horario actualizado exitosamente',
        horario_id,
        dias,
        inicio_hora,
        fin_hora
      }
    };

  } catch (e) {
    console.error('Error al modificar horario:', e);
    return {
      statusCode: 500,
      body: { error: 'Error interno del servidor', detalle: e.message }
    };
  }
};
