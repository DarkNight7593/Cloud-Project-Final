const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id, horario_id } = JSON.parse(event.body);

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
      };
    }

    // Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token, tenant_id })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    if (!curso_id || !horario_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan curso_id o horario_id' })
      };
    }

    const tenant_id_curso_id = `${tenant_id}#${curso_id}`;

    await dynamodb.delete({
      TableName: TABLE_HORARIO,
      Key: { tenant_id_curso_id, horario_id }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Horario eliminado exitosamente' })
    };

  } catch (error) {
    console.error('Error al eliminar horario:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno', detalle: error.message })
    };
  }
};

