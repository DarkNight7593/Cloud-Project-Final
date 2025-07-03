const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_BUSCAR_CURSO = process.env.FUNCION_BUSCAR_CURSO;
const FUNCION_BUSCAR_HORARIO = process.env.FUNCION_BUSCAR_HORARIO;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id, horario_id, estado } = JSON.parse(event.body);

    if (!token || !tenant_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token o tenant_id no proporcionado' })
      };
    }

    // 1. Validar token
    const validar = await lambda.invoke({
      FunctionName: FUNCION_VALIDAR,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ body: { token, tenant_id } })
    }).promise();

    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode !== 200) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Token inválido o expirado' })
      };
    }

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const rol = usuario.rol;
    const dni = usuario.dni;
    console.log(`Rol del usuario validado: ${rol}, DNI: ${dni}`);

    if (rol !== 'alumno') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Solo los alumnos pueden registrar compras' })
      };
    }

    if (!curso_id || !horario_id || !estado || !['reservado', 'inscrito'].includes(estado)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Datos incompletos o estado inválido' })
      };
    }

    // 2. Validar curso
    const cursoResult = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_CURSO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        queryStringParameters: { curso_id, tenant_id }
      })
    }).promise();

    const cursoPayload = JSON.parse(cursoResult.Payload);
    if (cursoPayload.statusCode !== 200) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Curso no encontrado' })
      };
    }

    const cursoData = typeof cursoPayload.body === 'string'
      ? JSON.parse(cursoPayload.body)
      : cursoPayload.body;

    // 3. Validar horario
    const horarioResult = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_HORARIO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        queryStringParameters: { tenant_id, curso_id, horario_id }
      })
    }).promise();

    const horarioPayload = JSON.parse(horarioResult.Payload);
    if (horarioPayload.statusCode !== 200) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Horario no encontrado' })
      };
    }

    const horarioData = typeof horarioPayload.body === 'string'
      ? JSON.parse(horarioPayload.body)
      : horarioPayload.body;

    // 4. Buscar estado actual del alumno
    const partitionKey = `${tenant_id}#${curso_id}`;
    const keyInscrito = `${dni}#inscrito`;
    const keyReservado = `${dni}#reservado`;

    const existing = await dynamodb.query({
      TableName: TABLE_COMPRAS,
      KeyConditionExpression: 'tenant_id_curso_id = :pk AND begins_with(dni_estado, :dni)',
      ExpressionAttributeValues: {
        ':pk': partitionKey,
        ':dni': dni
      }
    }).promise();

    const yaInscrito = existing.Items.find(e => e.dni_estado.endsWith('#inscrito'));
    const yaReservado = existing.Items.find(e => e.dni_estado.endsWith('#reservado'));

    if (estado === 'inscrito') {
      if (yaInscrito) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Ya estás inscrito en este curso' })
        };
      }

      if (yaReservado) {
        await dynamodb.delete({
          TableName: TABLE_COMPRAS,
          Key: {
            tenant_id_curso_id: partitionKey,
            dni_estado: keyReservado
          }
        }).promise();
      }

    } else if (estado === 'reservado') {
      if (yaInscrito) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Ya estás inscrito, no puedes reservar nuevamente' })
        };
      }

      if (yaReservado) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Ya has reservado este curso' })
        };
      }
    }

    // 5. Registrar compra
    await dynamodb.put({
      TableName: TABLE_COMPRAS,
      Item: {
        tenant_id_curso_id: partitionKey,
        dni_estado: `${dni}#${estado}`,
        curso_id,
        horario_id,
        dni,
        estado,
        curso_nombre: cursoData.nombre,
        instructor_dni: cursoData.instructor_dni,
        instructor_nombre: cursoData.instructor_nombre,
        dias: horarioData.dias,
        inicio_hora: horarioData.inicio_hora,
        fin_hora: horarioData.fin_hora
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Compra registrada exitosamente', estado })
    };

  } catch (error) {
    console.error('Error en Lambda_Comprar:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno', detalle: error.message })
    };
  }
};

