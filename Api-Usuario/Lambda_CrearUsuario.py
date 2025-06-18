import boto3
import hashlib
import os

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        tenant_id = event.get('tenant_id')
        dni = event.get('dni')
        full_name = event.get("full_name")
        password = event.get('password')
        rol = event.get('rol')
        nombre_tabla = os.environ["TABLE_USER"]

        if tenant_id and dni and full_name and password:
            hashed_password = hash_password(password)

            dynamodb = boto3.resource('dynamodb')
            t_usuarios = dynamodb.Table(nombre_tabla)

            t_usuarios.put_item(
                Item={
                    'tenant_id': tenant_id,
                    'dni': dni,
                    'full_name': full_name,
                    'rol': rol,
                    'password': hashed_password
                }
            )

            return {
                'statusCode': 200,
                'body': {
                    'message': 'User registered successfully',
                    'nombre': full_name
                }
            }

        return {
            'statusCode': 400,
            'body': {
                'error': 'Missing tenant_id, dni, full_name, or password'
            }
        }

    except Exception as e:
        print("Exception:", str(e))
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
