const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { curso_id, tenant_id } = event.queryStringParameters || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
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

    const usuario = JSON.parse(validarPayload.body); // contiene rol y dni
    const rol = usuario.rol;
    const dni = usuario.dni;

    if (!curso_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'curso_id requerido' })
      };
    }

    // Obtener curso actual para validar que el instructor sea el mismo
    const curso = await dynamodb.get({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id }
    }).promise();

    if (!curso.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Curso no encontrado' })
      };
    }

    const cursoInstructor = curso.Item.instructor_dni;

    // Solo puede editar si es admin o el instructor del curso
    if (rol !== 'admin' && dni !== cursoInstructor) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'No tiene permisos para editar este curso' })
      };
    }

    // Procesar actualizaciones
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const allowedFields = ['nombre', 'descripcion', 'inicio', 'fin', 'precio'];

    const updateFields = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No hay campos válidos para actualizar' })
      };
    }

    const updateExpression = 'SET ' + Object.keys(updateFields)
      .map((key, i) => `#${key} = :val${i}`)
      .join(', ');

    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    Object.keys(updateFields).forEach((key, i) => {
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:val${i}`] = updateFields[key];
    });

    await dynamodb.update({
      TableName: TABLE_CURSO,
      Key: { tenant_id, curso_id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Curso actualizado correctamente',
        curso_id,
        actualizaciones: updateFields
      })
    };

  } catch (error) {
    console.error('Error al actualizar curso:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        detalle: error.message
      })
    };
  }
};

