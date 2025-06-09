import boto3
import hashlib
import uuid # Genera valores únicos
from datetime import datetime, timedelta

# Hashear contraseña
def hash_password(password):
    # Retorna la contraseña hasheada
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    # Entrada (json)
    email = event.get('email')
    password = event['password']
    hashed_password = hash_password(password)
    # Proceso
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('t_usuarios')
    response = table.get_item(
        Key={
            'email': email
        }
    )
    if 'Item' not in response:
        return {
            'statusCode': 403,
            'body': 'Usuario no existe'
        }
    else:
        hashed_password_bd = response['Item']['password']
        if hashed_password == hashed_password_bd:
            # Genera token
            token = str(uuid.uuid4())
            fecha_hora_exp = datetime.now() + timedelta(minutes=60)
            registro = {
                'token': token,
                'expires': fecha_hora_exp.strftime('%Y-%m-%d %H:%M:%S')
            }
            table = dynamodb.Table('t_tokens_acceso')
            dynamodbResponse = table.put_item(Item = registro)
        else:
            return {
                'statusCode': 403,
                'body': 'Password incorrecto'
            }
    
    # Salida (json)
    return {
        'statusCode': 200,
        'token': token
    }