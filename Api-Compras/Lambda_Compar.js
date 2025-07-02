const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const TABLE_USUARIO = process.env.TABLE_USUARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_BUSCAR_CURSO = process.env.FUNCION_BUSCAR_CURSO;
const FUNCION_BUSCAR_HORARIO = process.env.FUNCION_BUSCAR_HORARIO;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    if (!token)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token no proporcionado' }) };

    // 1. Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403)
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) };

    const { tenant_id, dni } = validarPayload.body;

    const { curso_id, horario_id, estado = "reservado" } = JSON.parse(event.body || '{}');

    if (!curso_id || !horario_id)
      return { statusCode: 400, body: JSON.stringify({ error: 'curso_id y horario_id son requeridos' }) };

    // 2. Validar curso existente
    const cursoResult = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_CURSO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        queryStringParameters: { curso_id }
      })
    }).promise();

    const cursoPayload = JSON.parse(cursoResult.Payload);
    if (cursoPayload.statusCode !== 200)
      return { statusCode: 404, body: JSON.stringify({ error: 'Curso no encontrado' }) };

    // 3. Validar horario existente
    const horarioResult = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_HORARIO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        queryStringParameters: { curso_id, horario_id }
      })
    }).promise();

    const horarioPayload = JSON.parse(horarioResult.Payload);
    if (horarioPayload.statusCode !== 200)
      return { statusCode: 404, body: JSON.stringify({ error: 'Horario no encontrado' }) };

    // 4. Registrar compra
    const partitionKey = `${tenant_id}#${curso_id}`;
    const sortKey = `${dni}$${estado}`;

    const { nombre: curso_nombre, instructor_dni } = cursoPayload;
    const { dias, inicio_hora, fin_hora } = horarioPayload;

    // Obtener nombre del instructor (por si no está en el cursoPayload)
    const userResult = await dynamodb.get({
    TableName: TABLE_USUARIO,
    Key: { tenant_id, dni: instructor_dni }
    }).promise();

    const instructor_nombre = userResult.Item?.full_name || instructor_dni;

    await dynamodb.put({
    TableName: TABLE_COMPRAS,
    Item: {
        tenant_id$curso_id: partitionKey,
        dni$estado: sortKey,
        curso_id,
        horario_id,
        dni,
        estado,
        timestamp: new Date().toISOString(),

        // Campos que necesitas para mostrar en frontend
        curso_nombre,
        instructor_nombre,
        dias,
        inicio_hora,
        fin_hora
    }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Compra registrada con éxito', curso_id, horario_id, estado })
    };

  } catch (error) {
    console.error('Error en Lambda_Comprar:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno', detalle: error.message })
    };
  }
};
