// Only load dotenv if running locally (not in VCR)
if (!process.env.VCR_PORT) {
    require('dotenv').config();
}

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Jimp = require('jimp');

const app = express();

// VCR Cloud Runtime compatibility - VCR_PORT and VCR_HOST take precedence
const PORT = process.env.VCR_PORT || process.env.PORT || 3000;
const HOST = process.env.VCR_HOST || process.env.HOST || '0.0.0.0';

// Determine if running on VCR
const isVCR = !!process.env.VCR_PORT;

// Function to determine the best storage path
function getStoragePath() {
    const possiblePaths = isVCR 
        ? ['/neru-data', '/tmp/rcs-data', path.join(__dirname, 'data')]
        : [path.join(__dirname, 'data')];
    
    for (const testPath of possiblePaths) {
        try {
            // Try to create the directory
            fs.mkdirSync(testPath, { recursive: true });
            // Test if we can write to it
            const testFile = path.join(testPath, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log(`Using storage path: ${testPath}`);
            return testPath;
        } catch (err) {
            console.warn(`Cannot use storage path ${testPath}: ${err.message}`);
        }
    }
    
    // Ultimate fallback to /tmp
    const fallbackPath = '/tmp/rcs-uploads';
    fs.mkdirSync(fallbackPath, { recursive: true });
    console.log(`Using fallback storage path: ${fallbackPath}`);
    return fallbackPath;
}

// Initialize storage paths
const STORAGE_PATH = getStoragePath();
const UPLOADS_PATH = path.join(STORAGE_PATH, 'uploads');
const TEMPLATES_PATH = path.join(STORAGE_PATH, 'templates.json');

// RCS Image Limits
const RCS_MAX_IMAGE_WIDTH = 1440;
const RCS_MAX_IMAGE_HEIGHT = 1440;
const RCS_MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

// Ensure storage directories exist (with sync verification)
function ensureStorageExists() {
    try {
        if (!fs.existsSync(STORAGE_PATH)) {
            fs.mkdirSync(STORAGE_PATH, { recursive: true });
            console.log(`Created storage directory: ${STORAGE_PATH}`);
        }
        if (!fs.existsSync(UPLOADS_PATH)) {
            fs.mkdirSync(UPLOADS_PATH, { recursive: true });
            console.log(`Created uploads directory: ${UPLOADS_PATH}`);
        }
        // Verify the directory is actually writable
        const testFile = path.join(UPLOADS_PATH, '.test-' + Date.now());
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
    } catch (error) {
        console.error('Error creating/verifying storage directories:', error);
        return false;
    }
}

ensureStorageExists();

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_PATH));

// Configure multer for file uploads with persistent storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure directory exists and is writable
        const storageReady = ensureStorageExists();
        if (!storageReady) {
            return cb(new Error('Upload storage is not available. Please try again.'));
        }
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for initial upload
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|m4v|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images, videos, and PDFs are allowed.'));
        }
    }
});

// Helper function to get file URL
function getFileUrl(req, filename) {
    const forwardedProto = req.get('x-forwarded-proto');
    const host = req.get('x-forwarded-host') || req.get('host');
    
    let protocol = 'https';
    if (!forwardedProto && req.protocol === 'http' && !host.includes('cloudfront') && !host.includes('vonage')) {
        protocol = 'http';
    }
    
    return `${protocol}://${host}/uploads/${filename}`;
}

// Upload file endpoint with RCS-compliant image resizing
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const fileType = req.body.type || 'file';
        const filePath = req.file.path;
        const isImage = /\.(jpg|jpeg|png)$/i.test(req.file.originalname);
        
        let finalFilename = req.file.filename;
        let finalSize = req.file.size;
        let wasResized = false;
        let dimensions = null;
        
        // Process images for RCS compliance using Jimp (pure JS, works on VCR)
        if (isImage && (fileType === 'image' || fileType === 'card')) {
            try {
                // Load image with Jimp
                const image = await Jimp.read(filePath);
                dimensions = { width: image.bitmap.width, height: image.bitmap.height };
                
                const needsResize = 
                    image.bitmap.width > RCS_MAX_IMAGE_WIDTH || 
                    image.bitmap.height > RCS_MAX_IMAGE_HEIGHT ||
                    req.file.size > RCS_MAX_IMAGE_SIZE;
                
                if (needsResize) {
                    console.log(`Resizing image: ${image.bitmap.width}x${image.bitmap.height}, ${req.file.size} bytes`);
                    
                    // Calculate new dimensions maintaining aspect ratio
                    let newWidth = image.bitmap.width;
                    let newHeight = image.bitmap.height;
                    
                    if (newWidth > RCS_MAX_IMAGE_WIDTH || newHeight > RCS_MAX_IMAGE_HEIGHT) {
                        const ratio = Math.min(
                            RCS_MAX_IMAGE_WIDTH / newWidth,
                            RCS_MAX_IMAGE_HEIGHT / newHeight
                        );
                        newWidth = Math.round(newWidth * ratio);
                        newHeight = Math.round(newHeight * ratio);
                    }
                    
                    // Create resized filename
                    const ext = path.extname(req.file.filename).toLowerCase();
                    const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
                    finalFilename = `${baseName}_rcs${ext}`;
                    const outputPath = path.join(UPLOADS_PATH, finalFilename);
                    
                    // Resize image
                    image.resize(newWidth, newHeight);
                    
                    // Set quality and save
                    let quality = 85;
                    
                    do {
                        // Apply quality setting
                        image.quality(quality);
                        
                        // Write to file
                        await image.writeAsync(outputPath);
                        
                        // Check file size
                        const stats = fs.statSync(outputPath);
                        finalSize = stats.size;
                        
                        // If still too large, reduce quality
                        if (finalSize > RCS_MAX_IMAGE_SIZE && quality > 50) {
                            quality -= 10;
                            console.log(`Image still too large (${finalSize}), reducing quality to ${quality}`);
                        } else {
                            break;
                        }
                    } while (quality > 50);
                    
                    // Get new dimensions
                    const resizedImage = await Jimp.read(outputPath);
                    dimensions = { width: resizedImage.bitmap.width, height: resizedImage.bitmap.height };
                    wasResized = true;
                    
                    // Remove original file
                    fs.unlinkSync(filePath);
                    
                    console.log(`Resized to: ${dimensions.width}x${dimensions.height}, ${finalSize} bytes`);
                }
            } catch (jimpError) {
                console.error('Image processing error:', jimpError);
                // Continue with original file if resize fails
            }
        }
        
        const fileUrl = getFileUrl(req, finalFilename);
        
        console.log(`File uploaded: ${finalFilename}, URL: ${fileUrl}, Resized: ${wasResized}`);
        
        res.json({
            success: true,
            filename: finalFilename,
            url: fileUrl,
            mimetype: req.file.mimetype,
            size: finalSize,
            originalSize: req.file.size,
            resized: wasResized,
            dimensions: dimensions
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete file endpoint
app.delete('/api/upload/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(UPLOADS_PATH, filename);
        
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ success: true, message: 'File deleted successfully' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send RCS message via Vonage API
app.post('/api/send-message', async (req, res) => {
    try {
        const { payload, appId, privateKey } = req.body;
        
        // VCR deployment: API Key/Secret from environment (fallback)
        const apiKey = process.env.VONAGE_API_KEY;
        const apiSecret = process.env.VONAGE_API_SECRET;
        
        // Local/Login deployment: Use credentials from request body
        const applicationId = appId;
        const privateKeyData = privateKey;
        
        if (!payload) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required field: payload' 
            });
        }
        
        console.log('Message payload:', JSON.stringify(payload, null, 2));
        
        let authHeader;
        
        // PRIORITY 1: Check if we have JWT credentials from login (appId + privateKey)
        // This SUPERSEDES the VCR API Key/Secret authentication
        if (applicationId && privateKeyData) {
            console.log('Using JWT authentication (Login credentials - PRIORITY)');
            const now = Math.floor(Date.now() / 1000);
            const jwtPayload = {
                application_id: applicationId,
                iat: now,
                exp: now + 3600,
                jti: require('crypto').randomUUID()
            };
            
            try {
                const jwtToken = jwt.sign(jwtPayload, privateKeyData, { algorithm: 'RS256' });
                authHeader = `Bearer ${jwtToken}`;
            } catch (jwtError) {
                console.error('JWT generation error:', jwtError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to generate JWT token. Check your private key format.' 
                });
            }
        }
        // PRIORITY 2: Fall back to API Key/Secret if no login credentials (VCR fallback)
        else if (apiKey && apiSecret) {
            console.log('Using API Key/Secret authentication (VCR fallback mode)');
            const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
            authHeader = `Basic ${credentials}`;
        } 
        else {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing authentication credentials. Please configure App ID and Private Key in Settings.' 
            });
        }
        
        // Send message to Vonage API
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch('https://api.nexmo.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const responseData = await response.json();
            
            if (response.ok) {
                console.log('Message sent successfully:', responseData.message_uuid);
                res.json({
                    success: true,
                    message_uuid: responseData.message_uuid,
                    workflow_id: responseData.workflow_id
                });
            } else {
                console.error('Vonage API error:', JSON.stringify(responseData, null, 2));
                res.status(response.status).json({
                    success: false,
                    error: responseData.title || responseData.detail || 'API request failed',
                    details: responseData
                });
            }
        } catch (apiError) {
            console.error('API call error:', apiError);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to call Vonage API: ' + apiError.message 
            });
        }
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Send batch messages
app.post('/api/send-batch-messages', async (req, res) => {
    try {
        const { basePayload, phoneNumbers, appId, privateKey } = req.body;
        
        // VCR deployment: API Key/Secret from environment (fallback)
        const apiKey = process.env.VONAGE_API_KEY;
        const apiSecret = process.env.VONAGE_API_SECRET;
        
        if (!basePayload || !phoneNumbers) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }
        
        if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'phoneNumbers must be a non-empty array' 
            });
        }
        
        let authHeader;
        
        // PRIORITY 1: JWT credentials from login
        if (appId && privateKey) {
            console.log('Batch send: Using JWT authentication (Login credentials - PRIORITY)');
            const now = Math.floor(Date.now() / 1000);
            const jwtPayload = {
                application_id: appId,
                iat: now,
                exp: now + 3600,
                jti: require('crypto').randomUUID()
            };
            
            try {
                const jwtToken = jwt.sign(jwtPayload, privateKey, { algorithm: 'RS256' });
                authHeader = `Bearer ${jwtToken}`;
            } catch (jwtError) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to generate JWT token' 
                });
            }
        }
        // PRIORITY 2: Fall back to API Key/Secret
        else if (apiKey && apiSecret) {
            console.log('Batch send: Using API Key/Secret authentication (VCR fallback)');
            const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
            authHeader = `Basic ${credentials}`;
        } 
        else {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing authentication credentials' 
            });
        }
        
        const fetch = (await import('node-fetch')).default;
        const results = [];
        
        // Send messages sequentially with small delay
        for (const phoneNumber of phoneNumbers) {
            const payload = { ...basePayload, to: phoneNumber };
            
            try {
                const response = await fetch('https://api.nexmo.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                const responseData = await response.json();
                
                if (response.ok) {
                    results.push({
                        phoneNumber,
                        success: true,
                        message_uuid: responseData.message_uuid
                    });
                } else {
                    results.push({
                        phoneNumber,
                        success: false,
                        error: responseData.title || responseData.detail || 'Failed'
                    });
                }
            } catch (error) {
                results.push({
                    phoneNumber,
                    success: false,
                    error: error.message
                });
            }
            
            // Small delay between messages
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        res.json({ success: true, results });
    } catch (error) {
        console.error('Batch send error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// === TEMPLATES API (Server-side persistent storage) ===

// Get all templates
app.get('/api/templates', (req, res) => {
    try {
        if (fs.existsSync(TEMPLATES_PATH)) {
            const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
            res.json({ success: true, templates });
        } else {
            res.json({ success: true, templates: [] });
        }
    } catch (error) {
        console.error('Error reading templates:', error);
        res.json({ success: true, templates: [] });
    }
});

// Save templates
app.post('/api/templates', (req, res) => {
    try {
        const { templates } = req.body;
        ensureStorageExists();
        fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2));
        console.log(`Saved ${templates.length} templates to persistent storage`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add single template
app.post('/api/templates/add', (req, res) => {
    try {
        const { template } = req.body;
        ensureStorageExists();
        
        let templates = [];
        if (fs.existsSync(TEMPLATES_PATH)) {
            templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
        }
        
        templates.push(template);
        fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2));
        console.log(`Added template: ${template.name}`);
        res.json({ success: true, index: templates.length - 1 });
    } catch (error) {
        console.error('Error adding template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete template
app.delete('/api/templates/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        if (fs.existsSync(TEMPLATES_PATH)) {
            const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
            if (index >= 0 && index < templates.length) {
                templates.splice(index, 1);
                fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2));
                console.log(`Deleted template at index ${index}`);
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, error: 'Template not found' });
            }
        } else {
            res.status(404).json({ success: false, error: 'No templates file' });
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint for VCR
app.get('/_/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Alternative health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        environment: isVCR ? 'VCR' : 'Local',
        storagePath: STORAGE_PATH
    });
});

// Catch-all route to serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, HOST, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 RCS Message Designer - Vonage                           ║
║                                                               ║
║   Server: http://${HOST}:${PORT}                                ║
║   Environment: ${isVCR ? 'VCR Cloud Runtime' : 'Local/Standard'}                           ║
║   Storage: ${STORAGE_PATH}                              
║                                                               ║
║   Features:                                                   ║
║   ✅ Message Designer with Live Preview                       ║
║   ✅ Auto Image Resize for RCS (max 1440x1440, 2MB)          ║
║   ✅ Template Management (Persistent on VCR)                  ║
║   ✅ Batch Sending via CSV                                    ║
║   ✅ Comprehensive Help Documentation                         ║
║                                                               ║
║   Authentication Priority:                                    ║
║   1. Login credentials (App ID + Private Key)                ║
║   2. VCR API Key/Secret (fallback)                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    if (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
        console.log('VCR API Key/Secret available as fallback');
        console.log(`API Key: ${process.env.VONAGE_API_KEY}`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
