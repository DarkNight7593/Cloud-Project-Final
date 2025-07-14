const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_COMPRAS = process.env.TABLE_COMPRAS;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;
const FUNCION_BUSCAR_CURSO = process.env.FUNCION_BUSCAR_CURSO;
const FUNCION_BUSCAR_HORARIO = process.env.FUNCION_BUSCAR_HORARIO;

exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    const { tenant_id, curso_id, horario_id } = event.query || {};

    if (!token || !tenant_id || !curso_id) {
      return {
        statusCode: 400,
        body: { error: 'Faltan token, tenant_id o curso_id' }
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
      let errorMessage = 'Token inválido';
      try {
        const parsed = JSON.parse(validarPayload.body);
        errorMessage = parsed.error || errorMessage;
      } catch {}
      return { statusCode: validarPayload.statusCode, body: { error: errorMessage } };
    }

    const tenantCursoKey = `${tenant_id}#${curso_id}`;

    // Obtener datos del curso
    const cursoResp = await lambda.invoke({
      FunctionName: FUNCION_BUSCAR_CURSO,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        headers: { Authorization: token },
        query: { tenant_id, curso_id }
      })
    }).promise();

    const cursoPayload = JSON.parse(cursoResp.Payload);
    if (cursoPayload.statusCode !== 200) {
      return { statusCode: 404, body: { error: 'Curso no encontrado' } };
    }

    const curso = typeof cursoPayload.body === 'string'
      ? JSON.parse(cursoPayload.body)
      : cursoPayload.body;

    let horario = null;

    // Si hay horario, obtener datos actuales del horario
    if (horario_id) {
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
        return { statusCode: 404, body: { error: 'Horario no encontrado' } };
      }

      horario = typeof horarioPayload.body === 'string'
        ? JSON.parse(horarioPayload.body)
        : horarioPayload.body;
    }

    // Buscar compras
    const indexName = horario ? 'tenant_curso_horario_index' : 'tenant_curso_index';
    const keyCond = horario
      ? 'tenant_id_curso_id = :pk AND horario_id = :hid'
      : 'tenant_id_curso_id = :pk';

    const attrValues = horario
      ? { ':pk': tenantCursoKey, ':hid': horario_id }
      : { ':pk': tenantCursoKey };

    const compras = await dynamodb.query({
      TableName: TABLE_COMPRAS,
      IndexName: indexName,
      KeyConditionExpression: keyCond,
      ExpressionAttributeValues: attrValues
    }).promise();

    if (!compras.Items || compras.Items.length === 0) {
      return { statusCode: 404, body: { error: 'No hay compras que actualizar' } };
    }

    // Preparar updates
    const updates = compras.Items.map(item => {
      const UpdateExpression = `
        set
          curso_nombre = :nombre,
          precio = :precio,
          fecha_inicio = :inicio,
          fecha_fin = :fin
          ${horario ? `,
            dias = :dias,
            inicio_hora = :ih,
            fin_hora = :fh
          ` : ''}
      `;

      const ExpressionAttributeValues = {
        ':nombre': curso.nombre,
        ':precio': curso.precio,
        ':inicio': curso.inicio,
        ':fin': curso.fin,
        ...(horario ? {
          ':dias': horario.dias,
          ':ih': horario.inicio_hora,
          ':fh': horario.fin_hora
        } : {})
      };

      return dynamodb.update({
        TableName: TABLE_COMPRAS,
        Key: {
          tenant_id_dni_estado: item.tenant_id_dni_estado,
          curso_id: item.curso_id
        },
        UpdateExpression,
        ExpressionAttributeValues
      }).promise();
    });

    await Promise.all(updates);

    return {
      statusCode: 200,
      body: { message: `${updates.length} compras actualizadas` }
    };

  } catch (error) {
    console.error('❌ Error al actualizar compras:', error);
    return {
      statusCode: 500,
      body: { error: 'Error interno', detalle: error.message }
    };
  }
};
