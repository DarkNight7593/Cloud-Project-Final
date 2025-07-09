const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

exports.handler = async (event) => {
  try {
    const basePath = path.resolve(__dirname, 'doc');

    // Usamos path confiable
    const reqPath = event.path || '/doc';
    console.log(`🔍 Ruta solicitada: ${reqPath}`);

    // Determinar ruta relativa
    let relativePath = reqPath.replace(/^\/doc/, '');
    if (relativePath === '' || relativePath === '/') {
      relativePath = 'index.html';
    } else {
      relativePath = relativePath.replace(/^\/+/, '');
    }

    // Ruta completa protegida
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.resolve(basePath, safePath);

    // Verificación de seguridad
    if (!filePath.startsWith(basePath)) {
      console.warn(`🚫 Intento de acceso no permitido: ${filePath}`);
      return forbiddenResponse();
    }

    // Verifica existencia del archivo
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      throw new Error('Archivo no encontrado o es un directorio');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(filePath);

    const isBinary = !contentType.startsWith('text') && contentType !== 'application/json';

    console.log(`✅ Archivo servido: ${filePath} (${contentType})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
      },
      body: isBinary ? fileBuffer.toString('base64') : fileBuffer.toString('utf-8'),
      isBase64Encoded: isBinary
    };

  } catch (err) {
    console.error(`❌ Error al servir archivo: ${err.message}`);
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
      },
      body: JSON.stringify({
        error: 'Archivo no encontrado',
        detalle: err.message
      }),
    };
  }
};

function forbiddenResponse() {
  return {
    statusCode: 403,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    },
    body: JSON.stringify({ error: 'Acceso denegado' })
  };
}
