const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// Upload function with error handling
const uploadToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            resource_type: 'auto',
            folder: 'chatmaster',
            use_filename: true,
            unique_filename: false,
            overwrite: true,
            quality: 'auto:eco',
            format: 'auto',
            ...options
        };

        cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) {
                console.error('Cloudinary upload error:', error);
                reject(error);
            } else {
                resolve(result);
            }
        }).end(buffer);
    });
};

// Delete function
const deleteFromCloudinary = (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (error, result) => {
            if (error) {
                console.error('Cloudinary delete error:', error);
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
};

// Generate thumbnail for images
const generateThumbnail = (publicId, width = 150, height = 150) => {
    return cloudinary.url(publicId, {
        width,
        height,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto:eco',
        format: 'auto'
    });
};

module.exports = {
    cloudinary,
    uploadToCloudinary,
    deleteFromCloudinary,
    generateThumbnail
};
