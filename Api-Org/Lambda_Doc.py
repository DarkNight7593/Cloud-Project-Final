import os
import mimetypes
import logging
import base64

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'doc'))

        # ✅ Usa 'path' (es más confiable que rawPath)
        req_path = event.get('path', '/doc')
        logger.info(f"Ruta solicitada: {req_path}")

        # ✅ Quita el prefijo '/doc' y define el archivo destino
        relative_path = req_path.replace('/doc', '', 1)
        if relative_path in ['', '/']:
            relative_path = 'index.html'
        else:
            relative_path = relative_path.lstrip('/')

        # ✅ Normaliza la ruta final al archivo
        file_path = os.path.abspath(os.path.join(base_path, os.path.normpath(relative_path)))

        # ✅ Verificación de seguridad (evita salir de /doc)
        if not file_path.startswith(base_path):
            logger.warning(f"Acceso no permitido: {file_path}")
            return forbidden_response()

        # ✅ Verifica si el archivo existe
        if not os.path.isfile(file_path):
            logger.warning(f"Archivo no encontrado: {file_path}")
            return not_found_response(file_path)

        # ✅ Detecta el tipo MIME
        content_type, _ = mimetypes.guess_type(file_path)
        content_type = content_type or 'application/octet-stream'

        with open(file_path, 'rb') as f:
            content = f.read()

        is_binary = not content_type.startswith('text') and content_type not in [
            'application/json',
            'application/javascript'
        ]

        logger.info(f"Archivo servido: {file_path} (binary={is_binary})")

        return {
            'statusCode': 200,
            'headers': {**cors_headers(), 'Content-Type': content_type},
            'body': base64.b64encode(content).decode('utf-8') if is_binary else content.decode('utf-8'),
            'isBase64Encoded': is_binary
        }

    except Exception as e:
        logger.exception('Error inesperado')
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': f'Error interno: {str(e)}'
        }

def not_found_response(path):
    return {
        'statusCode': 404,
        'headers': cors_headers(),
        'body': f'Archivo no encontrado: {path}'
    }

def forbidden_response():
    return {
        'statusCode': 403,
        'headers': cors_headers(),
        'body': 'Acceso denegado'
    }

def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    }


