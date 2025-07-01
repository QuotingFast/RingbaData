const logger = require('../utils/logger');

function validateBearerToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.query.token;

  let bearerToken = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7);
  } else if (token) {
    bearerToken = token;
  }

  if (!bearerToken) {
    logger.warn('Unauthorized access attempt - no token provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Bearer token required' 
    });
  }

  if (bearerToken !== process.env.API_BEARER_TOKEN) {
    logger.warn('Unauthorized access attempt - invalid token', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid bearer token' 
    });
  }

  next();
}

module.exports = {
  validateBearerToken
};
