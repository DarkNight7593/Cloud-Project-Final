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
    if (!token)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token no proporcionado' }) };

    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) };

    const { tenant_id } = validarPayload.body;
    const { curso_id } = JSON.parse(event.body || '{}');

    if (!curso_id)
      return { statusCode: 400, body: JSON.stringify({ error: 'curso_id requerido' }) };

    const tenantCursoKey = `${tenant_id}#${curso_id}`;

    const horarios = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id$curso_id = :key',
      ExpressionAttributeValues: { ':key': tenantCursoKey }
    }).promise();

    const promises = horarios.Items.map(item => {
      const payload = {
        curso_id,
        horario_id: item.horario_id
      };

      return lambda.invoke({
        FunctionName: FUNCION_ELIMINAR_HORARIO,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          headers: { Authorization: token },
          body: JSON.stringify(payload)
        })
      }).promise();
    });

    await Promise.all(promises);

    await dynamodb.delete({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Curso y ${promises.length} horarios eliminados` })
    };
  } catch (e) {
    console.error('Error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};

