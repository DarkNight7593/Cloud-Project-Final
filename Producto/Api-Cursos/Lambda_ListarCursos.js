const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_CURSO = process.env.TABLE_CURSO;
const TABLE_USUARIO = process.env.TABLE_USUARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    if (!token) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token no proporcionado' })
      };
    }

    // Validar el token llamando a la Lambda de autenticación
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ token })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    const { tenant_id } = validarPayload.body;

    // Leer parámetros de paginación y filtro
    const { limit = 5, lastKey } = event.queryStringParameters || {};
    const decodedLastKey = lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined;

    const body = event.body ? JSON.parse(event.body) : {};
    const dniInstructorFiltro = body.dni_instructor;

    // Definir parámetros de consulta
    let params;
    if (dniInstructorFiltro) {
      params = {
        TableName: TABLE_CURSO,
        KeyConditionExpression: 'tenant_id = :tenant_id',
        FilterExpression: 'instructor_dni = :dni',
        ExpressionAttributeValues: {
          ':tenant_id': tenant_id,
          ':dni': dniInstructorFiltro
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };
    } else {
      params = {
        TableName: TABLE_CURSO,
        KeyConditionExpression: 'tenant_id = :tenant_id',
        ExpressionAttributeValues: {
          ':tenant_id': tenant_id
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };
    }

    const result = await dynamodb.query(params).promise();

    // Reemplazar instructor_dni por nombre del instructor
    const cursosConNombres = await Promise.all(result.Items.map(async (curso) => {
      const userParams = {
        TableName: TABLE_USUARIO,
        Key: {
          tenant_id: tenant_id,
          dni: curso.instructor_dni
        }
      };

      const userResult = await dynamodb.get(userParams).promise();
      const nombreInstructor = userResult.Item ? userResult.Item.nombre : curso.instructor_dni;

      return {
        ...curso,
        instructor_nombre: nombreInstructor
      };
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        cursos: cursosConNombres,
        lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
      })
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
