const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { auth } = require('../middleware/auth');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const User = require('../models/User');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, videos, audio, and documents are allowed.'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
    }
});

// @route   POST api/upload/avatar
// @desc    Upload user avatar
// @access  Private
router.post('/avatar', [auth, upload.single('avatar')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Resize and optimize image
        const processedImage = await sharp(req.file.buffer)
            .resize(400, 400, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 80 })
            .toBuffer();

        // Upload to Cloudinary
        const result = await uploadToCloudinary(processedImage, {
            folder: 'chatmaster/avatars',
            public_id: `avatar_${req.user._id}_${Date.now()}`
        });

        // Delete old avatar if exists
        if (req.user.avatar.publicId) {
            await deleteFromCloudinary(req.user.avatar.publicId);
        }

        // Update user avatar
        req.user.avatar = {
            url: result.secure_url,
            publicId: result.public_id
        };
        await req.user.save();

        res.json({
            success: true,
            message: 'Avatar uploaded successfully',
            avatar: req.user.avatar
        });

    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// @route   POST api/upload/file
// @desc    Upload file for message
// @access  Private
router.post('/file', [auth, upload.single('file')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        let fileBuffer = req.file.buffer;
        let uploadOptions = {
            folder: 'chatmaster/files',
            resource_type: 'auto'
        };

        // Optimize images
        if (req.file.mimetype.startsWith('image/')) {
            fileBuffer = await sharp(req.file.buffer)
                .resize(1920, 1920, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 85 })
                .toBuffer();

            uploadOptions.folder = 'chatmaster/images';
        } else if (req.file.mimetype.startsWith('video/')) {
            uploadOptions.folder = 'chatmaster/videos';
        } else if (req.file.mimetype.startsWith('audio/')) {
            uploadOptions.folder = 'chatmaster/audio';
        }

        // Upload to Cloudinary
        const result = await uploadToCloudinary(fileBuffer, uploadOptions);

        // Generate thumbnail for images
        let thumbnail = null;
        if (req.file.mimetype.startsWith('image/')) {
            const thumbnailBuffer = await sharp(req.file.buffer)
                .resize(200, 200, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 70 })
                .toBuffer();

            const thumbnailResult = await uploadToCloudinary(thumbnailBuffer, {
                folder: 'chatmaster/thumbnails',
                public_id: `thumb_${result.public_id.split('/').pop()}`
            });

            thumbnail = thumbnailResult.secure_url;
        }

        const fileData = {
            url: result.secure_url,
            publicId: result.public_id,
            filename: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            thumbnail
        };

        // Add dimensions for images and videos
        if (result.width && result.height) {
            fileData.dimensions = {
                width: result.width,
                height: result.height
            };
        }

        // Add duration for audio and video
        if (result.duration) {
            fileData.duration = result.duration;
        }

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileData
        });

    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// @route   POST api/upload/group-avatar
// @desc    Upload group avatar
// @access  Private
router.post('/group-avatar', [auth, upload.single('avatar')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Resize and optimize image
        const processedImage = await sharp(req.file.buffer)
            .resize(400, 400, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 80 })
            .toBuffer();

        // Upload to Cloudinary
        const result = await uploadToCloudinary(processedImage, {
            folder: 'chatmaster/group-avatars',
            public_id: `group_avatar_${Date.now()}`
        });

        const avatar = {
            url: result.secure_url,
            publicId: result.public_id
        };

        res.json({
            success: true,
            message: 'Group avatar uploaded successfully',
            avatar
        });

    } catch (error) {
        console.error('Group avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload group avatar' });
    }
});

// @route   DELETE api/upload/:publicId
// @desc    Delete file from Cloudinary
// @access  Private
router.delete('/:publicId', auth, async (req, res) => {
    try {
        const publicId = req.params.publicId.replace(/,/g, '/');
        
        await deleteFromCloudinary(publicId);

        res.json({
            success: true,
            message: 'File deleted successfully'
        });

    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ 
                error: 'File too large. Maximum size is 10MB' 
            });
        }
        return res.status(400).json({ error: error.message });
    }
    
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    
    next();
});

module.exports = router;
