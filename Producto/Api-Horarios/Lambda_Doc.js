const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const reqPath = event.rawPath || '/doc';
  const basePath = path.resolve(__dirname, 'doc');

  let relativePath = reqPath.replace(/^\/doc/, '') || '/index.html';
  if (relativePath === '/') relativePath = '/index.html';

  const filePath = path.join(basePath, relativePath);

  // Log de depuración
  console.log("Request Path:", reqPath);
  console.log("Resolved File Path:", filePath);

  // Determinar Content-Type
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
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
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const fileContent = fs.readFileSync(filePath);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: fileContent.toString(),
      isBase64Encoded: false
    };
  } catch (err) {
    console.error('Error al leer el archivo:', filePath, err);
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({
        error: 'Archivo no encontrado',
        ruta: filePath,
        detalle: err.message
      }),
    };
  }
};
