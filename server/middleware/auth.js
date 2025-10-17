const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.header('Authorization');
        
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'No token provided, authorization denied' 
            });
        }

        // Check if token starts with 'Bearer '
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7, authHeader.length) 
            : authHeader;

        if (!token) {
            return res.status(401).json({ 
                error: 'Invalid token format, authorization denied' 
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user from database
            const user = await User.findById(decoded.userId).select('-password');
            
            if (!user) {
                return res.status(401).json({ 
                    error: 'Token valid but user not found' 
                });
            }

            // Add user to request
            req.user = user;
            next();
            
        } catch (jwtError) {
            if (jwtError.name === 'JsonWebTokenError') {
                return res.status(401).json({ 
                    error: 'Invalid token, authorization denied' 
                });
            } else if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'Token expired, please login again' 
                });
            } else {
                throw jwtError;
            }
        }
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            error: 'Server error in authentication' 
        });
    }
};

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
        return next();
    }

    try {
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7, authHeader.length) 
            : authHeader;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (user) {
            req.user = user;
        }
    } catch (error) {
        // Ignore errors in optional auth
        console.log('Optional auth failed:', error.message);
    }
    
    next();
};

module.exports = { auth, optionalAuth };
