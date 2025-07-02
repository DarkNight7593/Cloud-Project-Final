const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const data = JSON.parse(event.body);
    const { tenant_id, nombre, descripcion, inicio, fin, precio } = data;

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token y tenant_id son requeridos' })
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
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    const usuario = JSON.parse(validarPayload.body);

    // Verificar que sea un instructor
    if (usuario.rol !== 'instructor') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Solo los instructores pueden crear cursos' })
      };
    }

    if (!nombre || !descripcion || !inicio || !fin || !precio) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan campos obligatorios' })
      };
    }

    const curso_id = uuidv4();
    await dynamodb.put({
      TableName: TABLE_CURSO,
      Item: {
        tenant_id,
        curso_id,
        nombre,
        descripcion,
        inicio,
        fin,
        precio,
        instructor_dni: usuario.dni,
        instructor_nombre: usuario.full_name
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Curso creado exitosamente',
        curso_id,
        nombre,
        instructor: usuario.full_name
      })
    };

  } catch (error) {
    console.error('Error al crear curso:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        detalle: error.message
      })
    };
  }
};

