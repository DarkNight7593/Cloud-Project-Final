const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_ACTUALIZAR_COMPRA = process.env.FUNCION_ACTUALIZAR_COMPRA;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { curso_id, tenant_id } = event.query || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 404,
        body: { error: 'Token o tenant_id no proporcionado' }
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
        const parsedBody = typeof validarPayload.body === 'string'
          ? JSON.parse(validarPayload.body)
          : validarPayload.body;
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

    const rol = usuario.rol;
    const dni = usuario.dni;

    if (!curso_id) {
      return {
        statusCode: 400,
        body: { error: 'curso_id requerido' }
      };
    }

    // Obtener curso actual
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

    const cursoInstructor = curso.Item.instructor_dni;

    // Verificar permisos
    if (rol !== 'admin' && dni !== cursoInstructor) {
      return {
        statusCode: 401,
        body: { error: 'No tiene permisos para editar este curso' }
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
        body: { error: 'No hay campos válidos para actualizar' }
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

    // 🔄 Invocar Lambda para actualizar compras asociadas
    try {
      await lambda.invoke({
        FunctionName: FUNCION_ACTUALIZAR_COMPRA,
        InvocationType: 'Event', // asincrónico
        Payload: JSON.stringify({
          headers: { Authorization: token },
          query: { tenant_id, curso_id }
        })
      }).promise();
    } catch (e) {
      console.warn('⚠️ No se pudo invocar actualizarCompras:', e.message);
    }

    return {
      statusCode: 200,
      body: {
        message: 'Curso actualizado correctamente',
        curso_id,
        actualizaciones: updateFields
      }
    };

  } catch (error) {
    console.error('Error al actualizar curso:', error);
    return {
      statusCode: 500,
      body: {
        error: 'Error interno del servidor',
        detalle: error.message
      }
    };
  }
};
