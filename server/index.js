const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');
const friendRequestRoutes = require('./routes/friendRequests');

// Import socket handler
const socketHandler = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = socketIo(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    allowEIO3: true
});

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            process.env.CLIENT_URL || 'http://localhost:3000',
            'http://localhost:3000',
            'http://localhost:19006'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        error: "Too many requests from this IP, please try again later.",
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return req.path === '/health';
    }
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// MongoDB Connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log(`[MongoDB] Connected: ${conn.connection.host}`);
        
        mongoose.connection.on('error', (err) => {
            console.error('[MongoDB] Connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('[MongoDB] Disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('[MongoDB] Reconnected');
        });
        
    } catch (error) {
        console.error('[MongoDB] Connection failed:', error.message);
        process.exit(1);
    }
};

// Connect to database
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/friend-requests', friendRequestRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    const healthCheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100
        },
        activeConnections: io.engine.clientsCount || 0
    };
    
    res.json(healthCheck);
});

// Root endpoint - Welcome message
app.get('/', (req, res) => {
    res.json({
        name: 'ChatMaster API',
        version: '1.0.0',
        status: 'running',
        message: 'Welcome to ChatMaster API',
        frontend: 'https://chatmaster.vercel.app',
        documentation: {
            health: `${req.protocol}://${req.get('host')}/health`,
            apiDocs: `${req.protocol}://${req.get('host')}/api`,
        },
        endpoints: [
            'POST /api/auth/register',
            'POST /api/auth/login',
            'GET /api/chats',
            'GET /api/messages/:chatId',
            'POST /api/friend-requests/send',
            'GET /health'
        ],
        note: 'This is a backend API. Visit the frontend URL to use the app.'
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'ChatMaster API',
        version: '1.0.0',
        description: 'Real-time chat application API',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            chats: '/api/chats',
            messages: '/api/messages',
            upload: '/api/upload',
            friendRequests: '/api/friend-requests',
            health: '/health'
        }
    });
});

// Socket.io handler
socketHandler(io);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
    console.error('[Error]', err.stack);
    
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Server configuration
const PORT = process.env.PORT || 5000;

// Start server
server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    console.log(`[Socket.io] Server ready`);
    console.log(`[Environment] ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Client URL] ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
    console.log(`[Health Check] http://localhost:${PORT}/health`);
    
    if (process.env.NODE_ENV === 'development') {
        console.log(`[API Docs] http://localhost:${PORT}/api`);
    }
});

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);
    
    server.close((err) => {
        if (err) {
            console.error('[Shutdown] Error:', err);
            process.exit(1);
        }
        
        console.log('[Shutdown] HTTP server closed');
        
        mongoose.connection.close(false, () => {
            console.log('[Shutdown] MongoDB connection closed');
            console.log('[Shutdown] Complete');
            process.exit(0);
        });
    });
    
    setTimeout(() => {
        console.error('[Shutdown] Forced shutdown');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('[Fatal] Unhandled Rejection:', err);
    server.close(() => process.exit(1));
});

module.exports = { app, server, io };
