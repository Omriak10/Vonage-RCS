# RCS Message Designer (VCR Edition)

A powerful visual designer for creating and sending RCS (Rich Communication Services) messages through the Vonage Messages API. Optimized for deployment on Vonage Cloud Runtime (VCR).

## Features

- 🎨 **Visual Message Designer** - Intuitive interface for building RCS messages
- 📱 **Live Phone Preview** - See exactly how your message will appear
- 📋 **Template Management** - Save and reuse message designs (persistent on VCR)
- 🖼️ **Auto Image Resize** - Images automatically resized to meet RCS requirements
- 📤 **Batch Sending** - Send to multiple recipients via CSV upload
- 📝 **JSON Payload View** - Copy the exact API payload for integration
- ❓ **Comprehensive Help** - Built-in documentation for all message types

## VCR Deployment

### Prerequisites

1. Vonage CLI installed with VCR plugin
2. A Vonage Application with Messages capability

### Deploy to VCR

```bash
# Login to Vonage
vcr login

# Deploy the application
vcr deploy

# View logs
vcr logs -f
```

### vcr.yml Configuration

The `vcr.yml` file configures the VCR deployment:

```yaml
project:
    name: rcs-editor
instance:
    name: production
    runtime: nodejs22
    region: aws.euw1
    application-id: YOUR_APP_ID
    entrypoint: [node, server.js]
    capabilities:
        - messages-v1
    environment:
        - name: VONAGE_API_KEY
          value: "YOUR_API_KEY"
        - name: VONAGE_API_SECRET
          value: "YOUR_API_SECRET"
```

**Update the following values:**
- `application-id` - Your Vonage Application ID
- `VONAGE_API_KEY` - Your Vonage API Key
- `VONAGE_API_SECRET` - Your Vonage API Secret

## Authentication Priority

The application uses a dual-authentication system:

1. **PRIORITY 1: Login Credentials** (App ID + Private Key + Sender ID)
   - Configured via the web interface
   - Stored in browser localStorage
   - Takes precedence over VCR credentials

2. **PRIORITY 2: VCR Fallback** (API Key + Secret)
   - Used when no login credentials are provided
   - Set via environment variables in vcr.yml

This allows you to:
- Use your own credentials on VCR for specific use cases
- Fall back to VCR's authentication when needed

## Persistent Storage

On VCR, the application uses `/neru-data` for persistent storage:
- **Uploaded files**: `/neru-data/uploads/`
- **Templates**: `/neru-data/templates.json`

Files and templates persist across deployments and restarts.

## Local Development

### Install Dependencies

```bash
npm install
```

### Create .env file (optional)

```env
PORT=3000
VONAGE_API_KEY=your_api_key
VONAGE_API_SECRET=your_api_secret
```

### Start the Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### Open the Designer

Navigate to `http://localhost:3000`

## RCS Image Requirements

Images are automatically resized to meet RCS requirements:

| Property | Limit |
|----------|-------|
| Max File Size | 2 MB |
| Max Dimensions | 1440 x 1440 pixels |
| Formats | JPEG, PNG |

## Project Structure

```
rcs-editor/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # Styling
│   └── app.js          # Frontend JavaScript
├── data/               # Local storage (when not on VCR)
│   └── uploads/        # Uploaded files
├── server.js           # Express server
├── package.json        # Dependencies
├── vcr.yml             # VCR configuration
└── README.md           # This file
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload and auto-resize media files |
| `/api/upload/:filename` | DELETE | Remove uploaded file |
| `/api/send-message` | POST | Send single RCS message |
| `/api/send-batch-messages` | POST | Send to multiple recipients |
| `/api/templates` | GET | Get all saved templates |
| `/api/templates` | POST | Save all templates |
| `/api/templates/add` | POST | Add single template |
| `/api/templates/:index` | DELETE | Delete template |
| `/_/health` | GET | VCR health check |
| `/health` | GET | General health check |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VCR_PORT` | Set automatically by VCR |
| `VCR_HOST` | Set automatically by VCR |
| `PORT` | Server port (local, default: 3000) |
| `VONAGE_API_KEY` | Vonage API Key (fallback auth) |
| `VONAGE_API_SECRET` | Vonage API Secret (fallback auth) |

## Phone Number Format

Use E.164 format **without** the leading + or 00:

- ✅ Correct: `447700900000`
- ❌ Wrong: `+447700900000`
- ❌ Wrong: `07700900000`

## Help Documentation

Click the **"❓ Help"** button in the application to access:

1. **Overview** - What is RCS, tool features
2. **Message Types** - Detailed explanation of each type
3. **How to Use** - Step-by-step instructions
4. **RCS Limits** - All technical requirements

## Troubleshooting

### Files not persisting on VCR
- Ensure you're using the `/neru-data` directory
- Check VCR deployment logs

### Authentication errors
- Verify your credentials in the Settings modal
- Check that App ID matches an application with Messages capability
- Ensure Private Key format is correct (including headers)

### Images not uploading
- Check file format (JPEG, PNG only)
- Files are auto-resized if too large

## License

MIT License
