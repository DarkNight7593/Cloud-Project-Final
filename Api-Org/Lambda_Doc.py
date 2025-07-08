import os
import mimetypes
import logging
import base64

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        req_path = event.get('rawPath', '/doc')
        base_path = os.path.join(os.path.dirname(__file__), 'doc')

        # Normaliza el path
        relative_path = req_path.replace('/doc', '', 1) or '/index.html'
        file_path = os.path.join(base_path, relative_path.lstrip('/'))

        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')

        # Detectar tipo MIME
        content_type, _ = mimetypes.guess_type(file_path)
        content_type = content_type or 'application/octet-stream'

        # Leer archivo como binario por si es HTML/CSS/JS
        with open(file_path, 'rb') as f:
            content = f.read()

        # Codificar en base64 si es binario (ej. imágenes)
        is_binary = not content_type.startswith('text') and content_type != 'application/json'

        return {
            'statusCode': 200,
            'headers': { 'Content-Type': content_type },
            'body': base64.b64encode(content).decode('utf-8') if is_binary else content.decode('utf-8'),
            'isBase64Encoded': is_binary
        }

    except Exception as e:
        logger.error(f'Archivo no encontrado: {e}')
        return {
            'statusCode': 404,
            'body': 'Archivo no encontrado'
        }
