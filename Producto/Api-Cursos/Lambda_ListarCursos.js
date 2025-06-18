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
    const { limit = 5, lastKey, dni_instructor } = event.queryStringParameters || {};
    const decodedLastKey = lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined;

    let params;

    if (dni_instructor) {
      // Usamos el GSI tenant_instructor_index
      params = {
        TableName: TABLE_CURSO,
        IndexName: 'tenant_instructor_index',
        KeyConditionExpression: 'tenant_id = :tenant_id AND instructor_dni = :dni',
        ExpressionAttributeValues: {
          ':tenant_id': tenant_id,
          ':dni': dni_instructor
        },
        Limit: parseInt(limit),
        ExclusiveStartKey: decodedLastKey
      };
    } else {
      // Consulta normal por tenant_id
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

    const cursosConNombres = await Promise.all(result.Items.map(async (curso) => {
      const userParams = {
        TableName: TABLE_USUARIO,
        Key: {
          tenant_id,
          dni: curso.instructor_dni
        }
      };
      const userResult = await dynamodb.get(userParams).promise();
      const nombreInstructor = userResult.Item?.nombre || curso.instructor_dni;

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

