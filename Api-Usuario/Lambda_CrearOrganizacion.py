import boto3
import os

def lambda_handler(event, context):
    try:
        tenant_id = event.get('tenant_id')
        domain = event.get('domain')
        descripcion = event.get("descripcion")
        correo = event.get('correo')
        nombre_tabla = os.environ["TABLE_ORG"]

        if tenant_id and domain and descripcion and correo:
            dynamodb = boto3.resource('dynamodb')
            t_org = dynamodb.Table(nombre_tabla)

            t_org.put_item(
                Item={
                    'tenant_id': tenant_id,
                    'descripcion': descripcion,
                    'correo': correo,
                    'domain': domain
                }
            )

            return {
                'statusCode': 200,
                'body': {
                    'message': 'Org registered successfully',
                    'nombre': tenant_id
                }
            }

        return {
            'statusCode': 400,
            'body': {
                'error': 'Missing tenant_id, domain, descripcion, or correo'
            }
        }

    except Exception as e:
        print("Exception:", str(e))
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
