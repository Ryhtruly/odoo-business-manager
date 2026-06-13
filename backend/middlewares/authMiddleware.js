const { loadUsers } = require('../services/fileService');
const { verifyToken } = require('../services/authService');

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return req.query.access_token || '';
}

function checkRole(allowedRoles) {
  return (req, res, next) => {
    const tokenPayload = verifyToken(getBearerToken(req));
    if (!tokenPayload || !tokenPayload.username) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid session token' });
    }

    const users = loadUsers();
    const user = Array.isArray(users)
      ? users.find(u => u.username === tokenPayload.username)
      : null;

    if (!user || user.approved === false) {
      return res.status(401).json({ error: 'Unauthorized: User session is no longer valid' });
    }

    req.user = {
      username: user.username,
      name: user.name,
      role: user.role
    };

    if (user.role === 'admin') {
      return next();
    }
    if (allowedRoles.includes(user.role)) {
      return next();
    }
    return res.status(403).json({ error: `Forbidden: Access restricted for role '${user.role}'` });
  };
}

module.exports = { checkRole };
