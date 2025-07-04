const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_CURSO = process.env.FUNCION_CURSO;

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
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { tenant_id, curso_id, dias, inicio_hora, fin_hora } = body;

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
      };
    }

    if (!curso_id || !dias || !inicio_hora || !fin_hora) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan curso_id, dias, inicio_hora o fin_hora' })
      };
    }

    if (!Array.isArray(dias) || dias.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'dias debe ser un arreglo no vacío' })
      };
    }

    // Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token, tenant_id })
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

    // ✅ Verificar si el curso existe
    const buscarCurso = await lambda.invoke({
      FunctionName: FUNCION_CURSO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        queryStringParameters: { tenant_id, curso_id }
      })
    }).promise();

    const cursoPayload = JSON.parse(buscarCurso.Payload);
    if (cursoPayload.statusCode !== 200) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Curso no encontrado para este tenant_id y curso_id' })
      };
    }

    const tenant_id_curso_id = `${tenant_id}#${curso_id}`;

    // Verificar choques de horario
    const result = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :pk',
      ExpressionAttributeValues: {
        ':pk': tenant_id_curso_id
      }
    }).promise();

    const hayChoque = result.Items.find(h =>
      diasChocan(dias, h.dias) && horariosChocan(inicio_hora, fin_hora, h.inicio_hora, h.fin_hora)
    );

    if (hayChoque) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Existe choque de horario en al menos un día' })
      };
    }

    // Crear horario
    const horario_id = uuidv4();

    await dynamodb.put({
      TableName: TABLE_HORARIO,
      Item: {
        tenant_id_curso_id,
        horario_id,
        dias,
        inicio_hora,
        fin_hora
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Horario creado exitosamente',
        horario_id,
        dias,
        inicio_hora,
        fin_hora
      })
    };

  } catch (error) {
    console.error('Error al crear horario:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        detalle: error.message
      })
    };
  }
};
