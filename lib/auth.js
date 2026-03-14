import jwt from 'jsonwebtoken';

const withAuth = (handler) => {
  return async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication token required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Tambahkan payload user ke request agar bisa diakses oleh handler
      req.user = decoded;
      return handler(req, res);
    } catch (error) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
  };
};

export default withAuth;

