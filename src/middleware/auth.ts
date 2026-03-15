import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: 'admin' | 'komisz' | 'user';
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Brak tokenu autoryzacji' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Token nieważny lub wygasł' });
  }
};

export const requireRole = (...roles: Array<'admin' | 'komisz' | 'user'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Brak uprawnień' });
      return;
    }
    next();
  };
};
