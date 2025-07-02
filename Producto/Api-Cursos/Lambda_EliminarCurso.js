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
    const { curso_id, tenant_id } = event.queryStringParameters || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token y tenant_id son requeridos' })
      };
    }

    // Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        body: { token, tenant_id }
      })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode !== 200) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    const usuario = JSON.parse(validarPayload.body);

    // Solo instructores o admin pueden eliminar cursos
    if (!['admin', 'instructor'].includes(usuario.rol)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Solo administradores o instructores pueden eliminar cursos' })
      };
    }

    if (!curso_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'curso_id requerido' })
      };
    }

    const tenantCursoKey = tenant_id+'#'+curso_id;

    // Buscar los horarios del curso
    const horarios = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id_curso_id = :key',
      ExpressionAttributeValues: { ':key': tenantCursoKey }
    }).promise();

    // Eliminar cada horario usando su lambda
    const promises = horarios.Items.map(item => {
      const payload = {
        tenant_id,
        curso_id,
        horario_id: item.horario_id
      };

      return lambda.invoke({
        FunctionName: FUNCION_ELIMINAR_HORARIO,
        InvocationType: 'Event', // asincrónico
        Payload: JSON.stringify({
          headers: { Authorization: token },
          body: JSON.stringify(payload)
        })
      }).promise();
    });

    await Promise.all(promises);

    // Eliminar el curso
    await dynamodb.delete({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Curso y horarios eliminados correctamente',
        curso_id,
        total_horarios: promises.length
      })
    };

  } catch (e) {
    console.error('Error al eliminar curso:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        detalle: e.message
      })
    };
  }
};


