const { body, param, query } = require('express-validator');

// Common validation rules
const validators = {
    // User validators
    username: body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be between 3 and 20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    email: body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),

    password: body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/\d/)
        .withMessage('Password must contain at least one number'),

    // Message validators
    messageContent: body('content')
        .trim()
        .notEmpty()
        .withMessage('Message content is required')
        .isLength({ max: 5000 })
        .withMessage('Message content too long'),

    // ID validators
    mongoId: (field = 'id') => 
        param(field)
            .isMongoId()
            .withMessage('Invalid ID format'),

    // Pagination validators
    pagination: [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ],

    // Search validator
    searchQuery: query('q')
        .trim()
        .notEmpty()
        .withMessage('Search query is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Search query must be between 1 and 100 characters')
};

module.exports = validators;
