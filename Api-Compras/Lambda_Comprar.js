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
    let body = event.body;

    if (!body) {
      return {
        statusCode: 400,
        body: { error: 'Falta el body en la solicitud' }
      };
    }

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        return {
          statusCode: 400,
          body: { error: 'El body no es un JSON válido' }
        };
      }
    }

    const { tenant_id, curso_id, horario_id, estado } = body || {};

    if (!token || !tenant_id) {
      return {
        statusCode: 400,
        body: { error: 'Token o tenant_id no proporcionado' }
      };
    }

    if (!curso_id || !horario_id || !estado || !['reservado', 'inscrito'].includes(estado)) {
      return {
        statusCode: 400,
        body: { error: 'Faltan datos requeridos o estado inválido' }
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
      let errorMessage = 'Error al validar token';
      try {
        const parsed = typeof validarPayload.body === 'string'
          ? JSON.parse(validarPayload.body)
          : validarPayload.body;
        errorMessage = parsed.error || errorMessage;
      } catch {}
      return {
        statusCode: validarPayload.statusCode,
        body: { error: errorMessage }
      };
    }

    const usuario = typeof validarPayload.body === 'string'
      ? JSON.parse(validarPayload.body)
      : validarPayload.body;

    const { rol, dni, full_name } = usuario;

    if (rol !== 'alumno') {
      return {
        statusCode: 403,
        body: { error: 'Solo los alumnos pueden registrar compras' }
      };
    }

    // 2. Validar curso
    const cursoResp = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_CURSO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        query: { curso_id, tenant_id }
      })
    }).promise();

    const cursoPayload = JSON.parse(cursoResp.Payload);
    if (cursoPayload.statusCode !== 200) {
      return {
        statusCode: 404,
        body: { error: 'Curso no encontrado' }
      };
    }

    const curso = typeof cursoPayload.body === 'string'
      ? JSON.parse(cursoPayload.body)
      : cursoPayload.body;

    // 3. Validar horario
    const horarioResp = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_HORARIO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        query: { tenant_id, horario_id }
      })
    }).promise();

    const horarioPayload = JSON.parse(horarioResp.Payload);
    if (horarioPayload.statusCode !== 200) {
      return {
        statusCode: 404,
        body: { error: 'Horario no encontrado' }
      };
    }

    const horario = typeof horarioPayload.body === 'string'
      ? JSON.parse(horarioPayload.body)
      : horarioPayload.body;

    // 4. Verificar si ya existe compra en ese estado
    const pk = `${tenant_id}#${dni}#${estado}`;
    const compraExistente = await dynamodb.get({
      TableName: TABLE_COMPRAS,
      Key: { tenant_id_dni_estado: pk, curso_id }
    }).promise();

    if (compraExistente.Item) {
      return {
        statusCode: 409,
        body: { error: `Ya tienes este curso como ${estado}` }
      };
    }

    // 5. Eliminar reserva previa si va a inscribirse
    if (estado === 'inscrito') {
      const pkReservado = `${tenant_id}#${dni}#reservado`;
      await dynamodb.delete({
        TableName: TABLE_COMPRAS,
        Key: { tenant_id_dni_estado: pkReservado, curso_id }
      }).promise();
    }

    // 6. Registrar nueva compra
    await dynamodb.put({
      TableName: TABLE_COMPRAS,
      Item: {
        tenant_id_dni_estado: pk,
        curso_id,
        tenant_id_curso_id: `${tenant_id}#${curso_id}`,
        alumno_dni: dni,
        alumno_nombre: full_name,
        estado,
        horario_id,
        fecha_inicio: curso.inicio, 
        fecha_fin: curso.fin,
        precio: curso.precio,
        instructor_dni: curso.instructor_dni,
        instructor_nombre: curso.instructor_nombre,
        curso_nombre: curso.nombre,
        dias: horario.dias,
        inicio_hora: horario.inicio_hora,
        fin_hora: horario.fin_hora
      }
    }).promise();

    return {
      statusCode: 200,
      body: { message: `Curso ${estado} exitosamente` }
    };

  } catch (error) {
    console.error('Error en Lambda registrarCompra:', error);
    return {
      statusCode: 500,
      body: { error: 'Error interno', detalle: error.message }
    };
  }
};
