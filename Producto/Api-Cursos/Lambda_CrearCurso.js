const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const data = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { tenant_id, nombre, descripcion, inicio, fin, precio } = data;

    if (!token || !tenant_id) {
      return {
        statusCode: 401,
        body: { error: 'Token y tenant_id son requeridos' }
      };
    }

    // Validar token e identidad
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

      try {
        const parsedBody = JSON.parse(validarPayload.body);
        errorMessage = parsedBody.error || errorMessage;
      } catch (_) {}

      return {
        statusCode,
        body: { error: errorMessage }
      };
    }

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    // Verificar que sea un instructor
    if (usuario.rol !== 'instructor') {
      return {
        statusCode: 401,
        body: { error: 'Solo los instructores pueden crear cursos' }
      };
    }

    if (!nombre || !descripcion || !inicio || !fin || !precio) {
      return {
        statusCode: 400,
        body: { error: 'Faltan campos obligatorios' }
      };
    }

    const curso_id = uuidv4();
    const item = {
      tenant_id,
      curso_id,
      nombre,
      descripcion,
      inicio,
      fin,
      precio,
      instructor_dni: usuario.dni,
      instructor_nombre: usuario.full_name,
      tenant_instructor: `${tenant_id}#${usuario.dni}`
    };

    await dynamodb.put({
      TableName: TABLE_CURSO,
      Item: item
    }).promise();

    return {
      statusCode: 200,
      body: {
        message: 'Curso creado exitosamente',
        curso_id,
        nombre,
        instructor: usuario.full_name
      }
    };

  } catch (error) {
    console.error('Error al crear curso:', error);
    return {
      statusCode: 500,
      body: {
        error: 'Error interno del servidor',
        detalle: error.message
      }
    };
  }
};
