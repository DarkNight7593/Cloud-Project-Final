const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_ELIMINAR_HORARIO = process.env.FUNCION_ELIMINAR_HORARIO;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    let body = event.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    const { curso_id, tenant_id } = body || {};

    if (!token || !tenant_id || !curso_id) {
      return {
        statusCode: 400,
        body: { error: 'Se requieren token, tenant_id y curso_id' }
      };
    }

    // Validar token (sin stringify)
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        body: { token, tenant_id }
      })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);

    if (validarPayload.statusCode !== 200) {
      let statusCode = validarPayload.statusCode;
      let errorMessage = 'Error desconocido al validar token';

      const parsedBody = typeof validarPayload.body === 'string'
        ? JSON.parse(validarPayload.body)
        : validarPayload.body;

      errorMessage = parsedBody.error || errorMessage;

      return {
        statusCode,
        body: { error: errorMessage }
      };
    }

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const { rol, dni } = usuario;

    // Verificar si el curso existe
    const curso = await dynamodb.get({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    if (!curso.Item) {
      return {
        statusCode: 404,
        body: { error: 'Curso no encontrado' }
      };
    }

    const instructorDni = curso.Item.instructor_dni;

    if (rol !== 'admin' && dni !== instructorDni) {
      return {
        statusCode: 401,
        body: { error: 'No tiene permisos para eliminar este curso' }
      };
    }

    // Buscar horarios vinculados
    const tenantCursoKey = `${tenant_id}#${curso_id}`;
    const horarios = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :key',
      ExpressionAttributeValues: { ':key': tenantCursoKey }
    }).promise();

    // Eliminar cada horario invocando FUNCION_ELIMINAR_HORARIO (sin stringify)
    const eliminarHorarios = horarios.Items.map(item => {
      return lambda.invoke({
        FunctionName: FUNCION_ELIMINAR_HORARIO,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          headers: { Authorization: token },
          body: {
            tenant_id,
            curso_id,
            horario_id: item.horario_id
          }
        })
      }).promise();
    });

    await Promise.all(eliminarHorarios);

    // Eliminar el curso
    await dynamodb.delete({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    return {
      statusCode: 200,
      body: {
        message: 'Curso y horarios eliminados correctamente',
        curso_id,
        total_horarios: eliminarHorarios.length
      }
    };

  } catch (e) {
    console.error('Error al eliminar curso:', e);
    return {
      statusCode: 500,
      body: {
        error: 'Error interno del servidor',
        detalle: e.message
      }
    };
  }
};
