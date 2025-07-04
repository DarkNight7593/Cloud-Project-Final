const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

function diasChocan(d1, d2) {
  return d1.some(d => d2.includes(d));
}

function horariosChocan(i1, f1, i2, f2) {
  return i1 < f2 && f1 > i2;
}

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const body = JSON.parse(event.body);
    const { tenant_id, curso_id, horario_id, dias, inicio_hora, fin_hora } = body;

    if (!token || !tenant_id || !curso_id || !horario_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan token, tenant_id, curso_id o horario_id' })
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
      } catch (_) {
      }

      return {
        statusCode,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    const tenant_id_curso_id = `${tenant_id}#${curso_id}`;

    // ✅ Verificar que el horario exista
    const existing = await dynamodb.get({
      TableName: TABLE_HORARIO,
      Key: { tenant_id_curso_id, horario_id }
    }).promise();

    if (!existing.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'El horario no existe' })
      };
    }

    // Verificar colisiones
    const scan = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :pk',
      ExpressionAttributeValues: { ':pk': tenant_id_curso_id }
    }).promise();

    const choque = scan.Items.find(h =>
      h.horario_id !== horario_id &&
      diasChocan(dias, h.dias) &&
      horariosChocan(inicio_hora, fin_hora, h.inicio_hora, h.fin_hora)
    );

    if (choque) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Existe choque de horario en al menos un día' })
      };
    }

    // Actualizar horario (con posible descripción)
    const item = {
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Horario actualizado exitosamente',
        horario_id,
        dias,
        inicio_hora,
        fin_hora,
      })
    };

  } catch (e) {
    console.error('Error al modificar horario:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno del servidor', detalle: e.message })
    };
  }
};
