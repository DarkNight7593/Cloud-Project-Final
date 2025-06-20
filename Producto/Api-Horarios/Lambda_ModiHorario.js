const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const TABLE_HORARIO = process.env.TABLE_HORARIO;
const FUNCION_VALIDAR = process.env.FUNCION_VALIDAR;

function diasChocan(d1, d2) {
  return d1.some(d => d2.includes(d));
}

function horariosChocan(i1, f1, i2, f2) {
  return i1 < f2 && f1 > i2;
}
exports.handler = async (event) => {
  try {
    const token = event.headers?.Authorization;
    if (!token) return { statusCode: 403, body: JSON.stringify({ error: 'Token no proporcionado' }) };

    const validar = await lambda.invoke({ FunctionName: FUNCION_VALIDAR, InvocationType: 'RequestResponse', Payload: JSON.stringify({ token }) }).promise();
    const validarPayload = JSON.parse(validar.Payload);
    if (validarPayload.statusCode === 403) return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) };

    const { tenant_id } = validarPayload.body;
    const { curso_id, horario_id, dias, inicio_hora, fin_hora } = JSON.parse(event.body);
    const tenant_id$curso_id = `${tenant_id}#${curso_id}`;

    const scan = await dynamodb.query({
      TableName: TABLE_HORARIO,
      KeyConditionExpression: 'tenant_id$curso_id = :pk',
      ExpressionAttributeValues: { ':pk': tenant_id$curso_id }
    }).promise();

    const choque = scan.Items.find(h =>
      h.horario_id !== horario_id && diasChocan(dias, h.dias) && horariosChocan(inicio_hora, fin_hora, h.inicio_hora, h.fin_hora)
    );

    if (choque) return { statusCode: 409, body: JSON.stringify({ error: 'Existe choque de horario en al menos un día' }) };

    await dynamodb.put({
      TableName: TABLE_HORARIO,
      Item: {
        tenant_id$curso_id,
        horario_id,
        dias,
        inicio_hora,
        fin_hora
      }
    }).promise();

    return { statusCode: 200, body: JSON.stringify({ message: 'Horario actualizado' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
