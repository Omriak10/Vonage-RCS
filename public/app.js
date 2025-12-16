// Global state
let currentMessageType = 'text';
let uploadedFiles = {};
let carouselCards = [];
let csvPhoneNumbers = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkConfiguration();
    initializeApp();
    loadTemplatesFromServer();
});

// Check if configuration exists
function checkConfiguration() {
    const setupComplete = localStorage.getItem('vonage_setup_complete');
    const appId = localStorage.getItem('vonage_app_id');
    const senderId = localStorage.getItem('vonage_rcs_sender_id');
    
    if (setupComplete && appId) {
        const displayAppIdEl = document.getElementById('displayAppId');
        const displaySenderIdEl = document.getElementById('displaySenderId');
        
        displayAppIdEl.textContent = appId.substring(0, 20) + '...';
        if (senderId) {
            displaySenderIdEl.textContent = senderId;
        } else {
            displaySenderIdEl.textContent = 'Not configured';
            displaySenderIdEl.style.color = '#f59e0b';
        }
    } else {
        // No configuration, redirect to setup
        window.location.href = 'setup.html';
    }
}

// Reconfigure credentials - redirect to setup page
function reconfigure() {
    if (confirm('This will take you back to the setup page. Continue?')) {
        window.location.href = 'setup.html';
    }
}

function initializeApp() {
    setupMessageTypeButtons();
    renderMessageFields();
    updatePreview();
    
    document.getElementById('toNumber').addEventListener('input', updatePreview);
    
    const senderId = localStorage.getItem('vonage_rcs_sender_id') || 'RCS Sender';
    document.getElementById('previewSender').textContent = senderId;
    
    setupPreviewTabs();
}

// Setup preview tabs
function setupPreviewTabs() {
    const tabs = document.querySelectorAll('.preview-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            tab.classList.add('active');
            
            const tabName = tab.dataset.tab;
            const content = document.getElementById(tabName + 'Tab');
            if (content) {
                content.classList.add('active');
            }
        });
    });
}

// Message Type Selection
function setupMessageTypeButtons() {
    const buttons = document.querySelectorAll('.type-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMessageType = btn.dataset.type;
            renderMessageFields();
            updatePreview();
        });
    });
}

// Render message-specific fields
function renderMessageFields() {
    const container = document.getElementById('messageFields');
    container.innerHTML = '';
    
    const section = document.createElement('div');
    section.className = 'section';
    
    const title = document.createElement('label');
    title.className = 'section-title';
    title.textContent = `${getMessageTypeLabel(currentMessageType)} Settings`;
    section.appendChild(title);
    
    switch(currentMessageType) {
        case 'text':
            section.appendChild(createTextField());
            section.appendChild(createSuggestionsBuilder());
            break;
        case 'image':
            section.appendChild(createFileUpload('image', 'Image', 'image/*'));
            break;
        case 'video':
            section.appendChild(createFileUpload('video', 'Video', 'video/*'));
            break;
        case 'file':
            section.appendChild(createFileUpload('file', 'PDF File', '.pdf'));
            break;
        case 'card':
            section.appendChild(createCardBuilder(false));
            break;
        case 'carousel':
            section.appendChild(createCarouselBuilder());
            break;
    }
    
    container.appendChild(section);
}

// Create text field
function createTextField() {
    const group = document.createElement('div');
    group.className = 'form-group';
    
    const label = document.createElement('label');
    label.textContent = 'Message Text';
    
    const textarea = document.createElement('textarea');
    textarea.id = 'messageText';
    textarea.placeholder = 'Enter your message text (max 3072 characters)';
    textarea.maxLength = 3072;
    textarea.addEventListener('input', updatePreview);
    
    group.appendChild(label);
    group.appendChild(textarea);
    
    return group;
}

// Create file upload component
function createFileUpload(type, label, accept) {
    const container = document.createElement('div');
    
    const group = document.createElement('div');
    group.className = 'form-group';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    group.appendChild(labelEl);
    
    if (type === 'image') {
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'font-size: 0.8rem; color: #10b981; margin-bottom: 10px; padding: 8px; background: #ecfdf5; border-radius: 4px;';
        infoDiv.innerHTML = '✅ Images are automatically resized to meet RCS requirements (max 1440x1440px, 2MB)';
        group.appendChild(infoDiv);
    }
    
    const uploadDiv = document.createElement('div');
    uploadDiv.className = 'file-upload';
    uploadDiv.innerHTML = `
        <input type="file" id="${type}Upload" accept="${accept}" onchange="handleFileUpload(event, '${type}')">
        <label for="${type}Upload" class="file-upload-label">
            <div style="font-size: 2rem; margin-bottom: 10px;">📁</div>
            <div>Click to upload or drag and drop</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px;">
                ${accept === 'image/*' ? 'JPG, PNG (auto-resized)' : accept === 'video/*' ? 'MP4, WebM, M4V' : 'PDF only'}
            </div>
        </label>
    `;
    
    const previewDiv = document.createElement('div');
    previewDiv.id = `${type}Preview`;
    previewDiv.className = 'file-preview';
    previewDiv.style.display = 'none';
    
    group.appendChild(uploadDiv);
    group.appendChild(previewDiv);
    container.appendChild(group);
    
    const textGroup = document.createElement('div');
    textGroup.className = 'form-group';
    textGroup.style.marginTop = '15px';
    
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Caption (Optional)';
    textGroup.appendChild(textLabel);
    
    const textArea = document.createElement('textarea');
    textArea.id = `${type}Text`;
    textArea.placeholder = 'Add optional caption text...';
    textArea.style.minHeight = '80px';
    textArea.addEventListener('input', updatePreview);
    textGroup.appendChild(textArea);
    
    container.appendChild(textGroup);
    
    return container;
}

// Handle file upload with auto-resize for images
async function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    
    try {
        showToast('Uploading file...', 'info');
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            uploadedFiles[type] = data;
            displayFilePreview(type, data, file);
            updatePreview();
            
            if (data.resized) {
                showToast(`Image uploaded and resized to ${data.dimensions.width}x${data.dimensions.height}`, 'success');
            } else {
                showToast('File uploaded successfully!', 'success');
            }
        } else {
            showToast('Upload failed: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Upload error: ' + error.message, 'error');
    }
}

// Display file preview
function displayFilePreview(type, data, file) {
    const previewDiv = document.getElementById(`${type}Preview`);
    previewDiv.style.display = 'flex';
    
    let mediaPreview = '';
    if (type === 'image') {
        mediaPreview = `<img src="${data.url}" alt="Preview">`;
    } else if (type === 'video') {
        mediaPreview = `<video src="${data.url}" controls></video>`;
    } else {
        mediaPreview = `<div style="font-size: 2rem; font-weight: bold;">PDF</div>`;
    }
    
    let sizeInfo = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    if (data.resized) {
        sizeInfo += ` → ${(data.size / 1024 / 1024).toFixed(2)} MB (resized)`;
    }
    
    previewDiv.innerHTML = `
        ${mediaPreview}
        <div class="file-info">
            <div><strong>${file.name}</strong></div>
            <div style="color: var(--text-secondary); font-size: 0.8rem;">
                ${sizeInfo}
            </div>
            ${data.dimensions ? `<div style="color: var(--text-secondary); font-size: 0.8rem;">${data.dimensions.width} × ${data.dimensions.height}px</div>` : ''}
        </div>
        <button class="file-remove" onclick="removeFile('${type}')">Remove</button>
    `;
}

// Remove uploaded file
async function removeFile(type) {
    if (uploadedFiles[type]) {
        try {
            await fetch(`/api/upload/${uploadedFiles[type].filename}`, {
                method: 'DELETE'
            });
            
            delete uploadedFiles[type];
            document.getElementById(`${type}Preview`).style.display = 'none';
            document.getElementById(`${type}Upload`).value = '';
            updatePreview();
            showToast('File removed', 'success');
        } catch (error) {
            showToast('Error removing file', 'error');
        }
    }
}

// Handle CSV upload
function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        csvPhoneNumbers = lines.map(line => {
            return line.replace(/\D/g, '');
        }).filter(number => number.length > 0);
        
        if (csvPhoneNumbers.length === 0) {
            showToast('No valid phone numbers found in CSV', 'error');
            return;
        }
        
        document.getElementById('csvFileName').textContent = file.name;
        document.getElementById('csvPhoneCount').textContent = csvPhoneNumbers.length;
        
        const previewList = csvPhoneNumbers.slice(0, 5).join(', ');
        const moreText = csvPhoneNumbers.length > 5 ? ` ... and ${csvPhoneNumbers.length - 5} more` : '';
        document.getElementById('csvPhoneList').textContent = previewList + moreText;
        
        document.getElementById('csvPreview').style.display = 'block';
        document.getElementById('toNumber').value = '';
        
        showToast(`Loaded ${csvPhoneNumbers.length} phone numbers`, 'success');
    };
    
    reader.onerror = function() {
        showToast('Error reading CSV file', 'error');
    };
    
    reader.readAsText(file);
}

// Remove CSV
function removeCSV() {
    csvPhoneNumbers = [];
    document.getElementById('csvUpload').value = '';
    document.getElementById('csvPreview').style.display = 'none';
    document.getElementById('toNumber').value = '447700900000';
    showToast('CSV removed', 'info');
}

// Trigger card media upload
function triggerCardMediaUpload(cardIndex) {
    document.getElementById(`cardMediaUpload${cardIndex}`).click();
}

// Handle card media upload
async function handleCardMediaUpload(event, cardIndex) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'image');
    
    try {
        showToast('Uploading file...', 'info');
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById(`cardMedia${cardIndex}`).value = data.url;
            updatePreview();
            
            if (data.resized) {
                showToast(`Image uploaded and resized to ${data.dimensions.width}x${data.dimensions.height}`, 'success');
            } else {
                showToast('File uploaded successfully!', 'success');
            }
        } else {
            showToast('Upload failed: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Upload error: ' + error.message, 'error');
    }
}

// Create card builder
function createCardBuilder(isCarousel = false, cardIndex = 0) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card-builder';
    cardDiv.dataset.cardIndex = cardIndex;
    
    if (isCarousel) {
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header';
        cardHeader.innerHTML = `
            <span class="card-number">Card ${cardIndex + 1}</span>
            <button class="card-remove" onclick="removeCarouselCard(${cardIndex})">Remove</button>
        `;
        cardDiv.appendChild(cardHeader);
    }
    
    // Title
    const titleGroup = createFormGroup('Title', 'text', 'cardTitle' + cardIndex, 'Card title (max 200 chars)');
    titleGroup.querySelector('input').maxLength = 200;
    titleGroup.querySelector('input').addEventListener('input', updatePreview);
    cardDiv.appendChild(titleGroup);
    
    // Text
    const textGroup = createFormGroup('Text', 'textarea', 'cardText' + cardIndex, 'Card text (max 2000 chars)');
    const textarea = textGroup.querySelector('textarea');
    textarea.maxLength = 2000;
    textarea.style.minHeight = '80px';
    textarea.addEventListener('input', updatePreview);
    cardDiv.appendChild(textGroup);
    
    // Media URL
    const mediaGroup = document.createElement('div');
    mediaGroup.className = 'form-group';
    mediaGroup.innerHTML = `
        <label>Card Media</label>
        <div style="font-size: 0.8rem; color: #10b981; margin-bottom: 8px; padding: 6px; background: #ecfdf5; border-radius: 4px;">
            ✅ Images auto-resized for RCS
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 8px 16px; margin: 0;" onclick="triggerCardMediaUpload(${cardIndex})">
                📁 Upload Image
            </button>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">or enter URL below</span>
        </div>
        <input type="file" id="cardMediaUpload${cardIndex}" accept="image/*,video/*" style="display: none;" onchange="handleCardMediaUpload(event, ${cardIndex})">
        <input type="text" id="cardMedia${cardIndex}" placeholder="https://example.com/image.jpg" onchange="updatePreview()">
    `;
    cardDiv.appendChild(mediaGroup);
    
    // Media Height
    const heightGroup = document.createElement('div');
    heightGroup.className = 'form-group';
    heightGroup.innerHTML = `
        <label>Media Height</label>
        <select id="cardMediaHeight${cardIndex}" onchange="updatePreview()">
            <option value="SHORT">Short (112 DP)</option>
            <option value="MEDIUM">Medium (168 DP)</option>
            <option value="TALL" selected>Tall (264 DP)</option>
        </select>
    `;
    cardDiv.appendChild(heightGroup);
    
    // RCS Settings (only for standalone card)
    if (!isCarousel) {
        const orientationGroup = document.createElement('div');
        orientationGroup.className = 'form-group';
        orientationGroup.innerHTML = `
            <label>Card Orientation</label>
            <select id="cardOrientation" onchange="updatePreview()">
                <option value="VERTICAL">Vertical</option>
                <option value="HORIZONTAL">Horizontal</option>
            </select>
        `;
        cardDiv.appendChild(orientationGroup);
        
        const alignmentGroup = document.createElement('div');
        alignmentGroup.className = 'form-group';
        alignmentGroup.innerHTML = `
            <label>Image Alignment (Horizontal only)</label>
            <select id="cardImageAlignment" onchange="updatePreview()">
                <option value="LEFT">Left</option>
                <option value="RIGHT">Right</option>
            </select>
        `;
        cardDiv.appendChild(alignmentGroup);
    }
    
    // Suggestions
    cardDiv.appendChild(createSuggestionsBuilder(cardIndex));
    
    return cardDiv;
}

// Create carousel builder
function createCarouselBuilder() {
    const container = document.createElement('div');
    
    // Card Width
    const widthGroup = document.createElement('div');
    widthGroup.className = 'form-group';
    widthGroup.innerHTML = `
        <label>Card Width</label>
        <select id="carouselCardWidth" onchange="updatePreview()">
            <option value="SMALL">Small (180 DP)</option>
            <option value="MEDIUM" selected>Medium (296 DP)</option>
        </select>
    `;
    container.appendChild(widthGroup);
    
    // Cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.id = 'carouselCards';
    container.appendChild(cardsContainer);
    
    // Add card button
    const addButton = document.createElement('button');
    addButton.className = 'add-card-btn';
    addButton.textContent = '+ Add Card';
    addButton.type = 'button';
    addButton.onclick = addCarouselCard;
    container.appendChild(addButton);
    
    // Initialize with 2 cards
    setTimeout(() => {
        addCarouselCard();
        addCarouselCard();
    }, 0);
    
    return container;
}

// Add carousel card
function addCarouselCard() {
    const container = document.getElementById('carouselCards');
    if (!container) return;
    
    const currentCards = container.querySelectorAll('.card-builder').length;
    if (currentCards >= 10) {
        showToast('Maximum 10 cards allowed', 'error');
        return;
    }
    
    const card = createCardBuilder(true, currentCards);
    container.appendChild(card);
    updatePreview();
}

// Remove carousel card
function removeCarouselCard(index) {
    const container = document.getElementById('carouselCards');
    const cards = container.querySelectorAll('.card-builder');
    
    if (cards.length <= 2) {
        showToast('Carousel must have at least 2 cards', 'error');
        return;
    }
    
    cards[index].remove();
    
    // Re-index cards
    container.querySelectorAll('.card-builder').forEach((card, i) => {
        card.dataset.cardIndex = i;
        card.querySelector('.card-number').textContent = `Card ${i + 1}`;
    });
    
    updatePreview();
}

// Create suggestions builder
function createSuggestionsBuilder(cardIndex = null) {
    const container = document.createElement('div');
    container.className = 'form-group';
    
    const label = document.createElement('label');
    label.textContent = 'Suggestions (max 4)';
    container.appendChild(label);
    
    const suggestionsDiv = document.createElement('div');
    const suggestionsId = cardIndex !== null ? `suggestions${cardIndex}` : 'suggestions';
    suggestionsDiv.id = suggestionsId;
    container.appendChild(suggestionsDiv);
    
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'add-card-btn';
    addButton.textContent = '+ Add Suggestion';
    addButton.onclick = () => addSuggestion(suggestionsId);
    container.appendChild(addButton);
    
    return container;
}

// Add suggestion
function addSuggestion(containerId) {
    const container = document.getElementById(containerId);
    const currentCount = container.querySelectorAll('.suggestion-item').length;
    
    if (currentCount >= 4) {
        showToast('Maximum 4 suggestions allowed', 'error');
        return;
    }
    
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
        <select class="suggestion-type" onchange="toggleSuggestionFields(this); updatePreview();">
            <option value="reply">Text Button (Reply)</option>
            <option value="open_url">Hyperlink Button (Action)</option>
            <option value="dial">Dial a Number</option>
            <option value="view_location">View a Location</option>
            <option value="share_location">Share a Location</option>
            <option value="create_calendar_event">Create Calendar Event</option>
        </select>
        <input type="text" class="suggestion-text" placeholder="Button text (max 25 chars)" maxlength="25" onchange="updatePreview()">
        <input type="text" class="suggestion-postback" placeholder="Postback data" onchange="updatePreview()">
        <input type="url" class="suggestion-url" placeholder="URL (https://...)" style="display: none;" onchange="updatePreview()">
        <input type="tel" class="suggestion-phone" placeholder="Phone number (+15556667777)" style="display: none;" onchange="updatePreview()">
        <input type="url" class="suggestion-fallback" placeholder="Fallback URL (https://...)" style="display: none;" onchange="updatePreview()">
        <input type="text" class="suggestion-latitude" placeholder="Latitude (37.4220188)" style="display: none;" onchange="updatePreview()">
        <input type="text" class="suggestion-longitude" placeholder="Longitude (-122.0844786)" style="display: none;" onchange="updatePreview()">
        <input type="text" class="suggestion-pinlabel" placeholder="Pin label (optional)" style="display: none;" onchange="updatePreview()">
        <input type="datetime-local" class="suggestion-starttime" placeholder="Start time" style="display: none;" onchange="updatePreview()">
        <input type="datetime-local" class="suggestion-endtime" placeholder="End time" style="display: none;" onchange="updatePreview()">
        <input type="text" class="suggestion-eventtitle" placeholder="Event title" style="display: none;" onchange="updatePreview()">
        <input type="text" class="suggestion-eventdesc" placeholder="Event description" style="display: none;" onchange="updatePreview()">
        <button class="suggestion-remove" onclick="this.parentElement.remove(); updatePreview();">×</button>
    `;
    
    container.appendChild(item);
    updatePreview();
}

// Toggle suggestion fields based on type
function toggleSuggestionFields(selectElement) {
    const item = selectElement.closest('.suggestion-item');
    const urlField = item.querySelector('.suggestion-url');
    const phoneField = item.querySelector('.suggestion-phone');
    const fallbackField = item.querySelector('.suggestion-fallback');
    const latitudeField = item.querySelector('.suggestion-latitude');
    const longitudeField = item.querySelector('.suggestion-longitude');
    const pinlabelField = item.querySelector('.suggestion-pinlabel');
    const starttimeField = item.querySelector('.suggestion-starttime');
    const endtimeField = item.querySelector('.suggestion-endtime');
    const eventtitleField = item.querySelector('.suggestion-eventtitle');
    const eventdescField = item.querySelector('.suggestion-eventdesc');
    const type = selectElement.value;
    
    [urlField, phoneField, fallbackField, latitudeField, longitudeField, pinlabelField,
     starttimeField, endtimeField, eventtitleField, eventdescField].forEach(f => {
        if (f) f.style.display = 'none';
    });
    
    if (type === 'open_url') {
        urlField.style.display = 'block';
    } else if (type === 'dial') {
        phoneField.style.display = 'block';
        fallbackField.style.display = 'block';
    } else if (type === 'view_location') {
        latitudeField.style.display = 'block';
        longitudeField.style.display = 'block';
        pinlabelField.style.display = 'block';
        fallbackField.style.display = 'block';
    } else if (type === 'create_calendar_event') {
        starttimeField.style.display = 'block';
        endtimeField.style.display = 'block';
        eventtitleField.style.display = 'block';
        eventdescField.style.display = 'block';
        fallbackField.style.display = 'block';
    }
}

// Helper function to create form groups
function createFormGroup(label, type, id, placeholder) {
    const group = document.createElement('div');
    group.className = 'form-group';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    group.appendChild(labelEl);
    
    if (type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.id = id;
        textarea.placeholder = placeholder;
        group.appendChild(textarea);
    } else {
        const input = document.createElement('input');
        input.type = type;
        input.id = id;
        input.placeholder = placeholder;
        group.appendChild(input);
    }
    
    return group;
}

// Update preview
function updatePreview() {
    const preview = document.getElementById('messagePreview');
    preview.innerHTML = '';
    
    let previewContent = '';
    
    switch(currentMessageType) {
        case 'text':
            const text = document.getElementById('messageText')?.value || '';
            previewContent = `<div class="preview-text">${escapeHtml(text) || 'Enter your message text...'}</div>`;
            
            const suggestions = getSuggestions('suggestions');
            if (suggestions.length > 0) {
                previewContent += renderSuggestions(suggestions);
            }
            break;
            
        case 'image':
            if (uploadedFiles.image) {
                previewContent = `<img src="${uploadedFiles.image.url}" class="preview-image" alt="Image">`;
                const imageText = document.getElementById('imageText')?.value || '';
                if (imageText) {
                    previewContent += `<div class="preview-text" style="margin-top: 10px;">${escapeHtml(imageText)}</div>`;
                }
            } else {
                previewContent = '<div class="preview-text">Upload an image to preview</div>';
            }
            break;
            
        case 'video':
            if (uploadedFiles.video) {
                previewContent = `<video src="${uploadedFiles.video.url}" class="preview-video" controls></video>`;
                const videoText = document.getElementById('videoText')?.value || '';
                if (videoText) {
                    previewContent += `<div class="preview-text" style="margin-top: 10px;">${escapeHtml(videoText)}</div>`;
                }
            } else {
                previewContent = '<div class="preview-text">Upload a video to preview</div>';
            }
            break;
            
        case 'file':
            if (uploadedFiles.file) {
                previewContent = `
                    <div class="preview-file">
                        <div class="file-icon">PDF</div>
                        <div class="file-details">
                            <div class="file-name">Document.pdf</div>
                            <div class="file-type">PDF File</div>
                        </div>
                    </div>
                `;
                const fileText = document.getElementById('fileText')?.value || '';
                if (fileText) {
                    previewContent += `<div class="preview-text" style="margin-top: 10px;">${escapeHtml(fileText)}</div>`;
                }
            } else {
                previewContent = '<div class="preview-text">Upload a PDF to preview</div>';
            }
            break;
            
        case 'card':
            previewContent = renderCardPreview(0);
            break;
            
        case 'carousel':
            previewContent = renderCarouselPreview();
            break;
    }
    
    preview.innerHTML = previewContent;
    updateJSON();
}

// Render card preview
function renderCardPreview(cardIndex) {
    const title = document.getElementById(`cardTitle${cardIndex}`)?.value || 'Card Title';
    const text = document.getElementById(`cardText${cardIndex}`)?.value || 'Card description text';
    const mediaUrl = document.getElementById(`cardMedia${cardIndex}`)?.value || '';
    const suggestions = getSuggestions(`suggestions${cardIndex}`);
    
    return `
        <div class="preview-card">
            ${mediaUrl ? `<img src="${mediaUrl}" class="preview-card-media" alt="Card media">` : ''}
            <div class="preview-card-content">
                <div class="preview-card-title">${escapeHtml(title)}</div>
                <div class="preview-card-text">${escapeHtml(text)}</div>
                ${suggestions.length > 0 ? renderSuggestions(suggestions) : ''}
            </div>
        </div>
    `;
}

// Render carousel preview
function renderCarouselPreview() {
    const cardsContainer = document.getElementById('carouselCards');
    if (!cardsContainer) return '<div class="preview-text">Loading...</div>';
    
    const cards = cardsContainer.querySelectorAll('.card-builder');
    if (cards.length === 0) return '<div class="preview-text">Add cards to preview</div>';
    
    let carouselHTML = '<div class="preview-carousel">';
    
    cards.forEach((card, index) => {
        const title = document.getElementById(`cardTitle${index}`)?.value || 'Card Title';
        const text = document.getElementById(`cardText${index}`)?.value || 'Description';
        const mediaUrl = document.getElementById(`cardMedia${index}`)?.value || '';
        const suggestions = getSuggestions(`suggestions${index}`);
        
        carouselHTML += `
            <div class="preview-carousel-card">
                ${mediaUrl ? `<img src="${mediaUrl}" class="preview-card-media" alt="Card media">` : ''}
                <div class="preview-card-content">
                    <div class="preview-card-title">${escapeHtml(title)}</div>
                    <div class="preview-card-text">${escapeHtml(text)}</div>
                    ${suggestions.length > 0 ? renderSuggestions(suggestions) : ''}
                </div>
            </div>
        `;
    });
    
    carouselHTML += '</div>';
    return carouselHTML;
}

// Render suggestions
function renderSuggestions(suggestions) {
    if (suggestions.length === 0) return '';
    
    let html = '<div class="preview-suggestions">';
    suggestions.forEach(suggestion => {
        html += `<div class="preview-suggestion">${escapeHtml(suggestion.text)}</div>`;
    });
    html += '</div>';
    
    return html;
}

// Get suggestions from container
function getSuggestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    
    const suggestions = [];
    container.querySelectorAll('.suggestion-item').forEach(item => {
        const typeSelect = item.querySelector('.suggestion-type');
        const textInput = item.querySelector('.suggestion-text');
        const postbackInput = item.querySelector('.suggestion-postback');
        const urlInput = item.querySelector('.suggestion-url');
        const phoneInput = item.querySelector('.suggestion-phone');
        const fallbackInput = item.querySelector('.suggestion-fallback');
        const latitudeInput = item.querySelector('.suggestion-latitude');
        const longitudeInput = item.querySelector('.suggestion-longitude');
        const pinlabelInput = item.querySelector('.suggestion-pinlabel');
        const starttimeInput = item.querySelector('.suggestion-starttime');
        const endtimeInput = item.querySelector('.suggestion-endtime');
        const eventtitleInput = item.querySelector('.suggestion-eventtitle');
        const eventdescInput = item.querySelector('.suggestion-eventdesc');
        
        const text = textInput.value.trim();
        if (!text) return;
        
        const type = typeSelect.value;
        const postback = postbackInput.value.trim() || text;
        
        if (type === 'open_url') {
            const url = urlInput.value.trim();
            if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;
            suggestions.push({ type, text, postback_data: postback, url, description: text });
        } else if (type === 'dial') {
            const phone = phoneInput.value.trim();
            const fallback = fallbackInput.value.trim();
            if (!phone) return;
            const suggestion = { type, text, postback_data: postback, phone_number: phone };
            if (fallback) suggestion.fallback_url = fallback;
            suggestions.push(suggestion);
        } else if (type === 'view_location') {
            const latitude = latitudeInput.value.trim();
            const longitude = longitudeInput.value.trim();
            const pinlabel = pinlabelInput.value.trim();
            const fallback = fallbackInput.value.trim();
            if (!latitude || !longitude) return;
            const suggestion = { type, text, postback_data: postback, latitude, longitude };
            if (pinlabel) suggestion.pin_label = pinlabel;
            if (fallback) suggestion.fallback_url = fallback;
            suggestions.push(suggestion);
        } else if (type === 'share_location') {
            suggestions.push({ type, text, postback_data: postback });
        } else if (type === 'create_calendar_event') {
            const starttime = starttimeInput.value.trim();
            const endtime = endtimeInput.value.trim();
            const eventtitle = eventtitleInput.value.trim();
            const eventdesc = eventdescInput.value.trim();
            const fallback = fallbackInput.value.trim();
            if (!starttime || !endtime || !eventtitle || !eventdesc) return;
            const suggestion = {
                type, text, postback_data: postback,
                start_time: new Date(starttime).toISOString(),
                end_time: new Date(endtime).toISOString(),
                title: eventtitle,
                description: eventdesc
            };
            if (fallback) suggestion.fallback_url = fallback;
            suggestions.push(suggestion);
        } else {
            suggestions.push({ type, text, postback_data: postback });
        }
    });
    
    return suggestions;
}

// Build message payload
function buildMessagePayload() {
    const senderId = localStorage.getItem('vonage_rcs_sender_id') || '';
    
    const payload = {
        to: document.getElementById('toNumber').value,
        from: senderId,
        channel: 'rcs',
        message_type: currentMessageType
    };
    
    switch(currentMessageType) {
        case 'text':
            payload.text = document.getElementById('messageText')?.value || '';
            const textSuggestions = getSuggestions('suggestions');
            if (textSuggestions.length > 0) payload.suggestions = textSuggestions;
            break;
            
        case 'image':
            if (uploadedFiles.image) {
                payload.image = { url: uploadedFiles.image.url };
                const imageText = document.getElementById('imageText')?.value || '';
                if (imageText) payload.text = imageText;
            }
            break;
            
        case 'video':
            if (uploadedFiles.video) {
                payload.video = { url: uploadedFiles.video.url };
                const videoText = document.getElementById('videoText')?.value || '';
                if (videoText) payload.text = videoText;
            }
            break;
            
        case 'file':
            if (uploadedFiles.file) {
                payload.file = { url: uploadedFiles.file.url };
                const fileText = document.getElementById('fileText')?.value || '';
                if (fileText) payload.text = fileText;
            }
            break;
            
        case 'card':
            const title = document.getElementById('cardTitle0')?.value || '';
            const text = document.getElementById('cardText0')?.value || '';
            const mediaUrl = document.getElementById('cardMedia0')?.value || '';
            const mediaHeight = document.getElementById('cardMediaHeight0')?.value || 'TALL';
            
            payload.card = { title, text };
            if (mediaUrl) {
                payload.card.media_url = mediaUrl;
                payload.card.media_height = mediaHeight;
            }
            
            const cardSuggestions = getSuggestions('suggestions0');
            if (cardSuggestions.length > 0) payload.card.suggestions = cardSuggestions;
            
            payload.rcs = {
                card_orientation: document.getElementById('cardOrientation')?.value || 'VERTICAL',
                image_alignment: document.getElementById('cardImageAlignment')?.value || 'LEFT'
            };
            break;
            
        case 'carousel':
            const cardsContainer = document.getElementById('carouselCards');
            const cards = [];
            
            if (cardsContainer) {
                cardsContainer.querySelectorAll('.card-builder').forEach((cardEl, index) => {
                    const title = document.getElementById(`cardTitle${index}`)?.value || '';
                    const text = document.getElementById(`cardText${index}`)?.value || '';
                    const mediaUrl = document.getElementById(`cardMedia${index}`)?.value || '';
                    const mediaHeight = document.getElementById(`cardMediaHeight${index}`)?.value || 'TALL';
                    
                    const card = { title, text };
                    if (mediaUrl) {
                        card.media_url = mediaUrl;
                        card.media_height = mediaHeight;
                    }
                    
                    const cardSugs = getSuggestions(`suggestions${index}`);
                    if (cardSugs.length > 0) card.suggestions = cardSugs;
                    
                    cards.push(card);
                });
            }
            
            payload.carousel = { cards };
            payload.rcs = {
                card_width: document.getElementById('carouselCardWidth')?.value || 'MEDIUM'
            };
            break;
    }
    
    return payload;
}

// Update JSON display
function updateJSON() {
    const payload = buildMessagePayload();
    document.getElementById('jsonPayload').textContent = JSON.stringify(payload, null, 2);
}

// Send message
async function sendMessage() {
    const payload = buildMessagePayload();
    const isBatchSend = csvPhoneNumbers.length > 0;
    
    if (isBatchSend) {
        await sendBatchMessages(payload);
    } else {
        await sendSingleMessage(payload);
    }
}

// Send single message
async function sendSingleMessage(payload) {
    if (!payload.to) {
        showToast('Please fill in the recipient phone number', 'error');
        return;
    }
    
    if (!payload.from) {
        showToast('RCS Sender ID not configured. Please reconfigure.', 'error');
        return;
    }
    
    const appId = localStorage.getItem('vonage_app_id');
    const privateKey = localStorage.getItem('vonage_private_key');
    
    try {
        showToast('Sending message...', 'info');
        
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload, appId, privateKey })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Message sent successfully! UUID: ' + data.message_uuid, 'success');
        } else {
            showToast('Failed to send message: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// Send batch messages
async function sendBatchMessages(basePayload) {
    if (!basePayload.from) {
        showToast('RCS Sender ID not configured. Please reconfigure.', 'error');
        return;
    }
    
    const appId = localStorage.getItem('vonage_app_id');
    const privateKey = localStorage.getItem('vonage_private_key');
    
    try {
        showToast(`Sending messages to ${csvPhoneNumbers.length} recipients...`, 'info');
        
        const response = await fetch('/api/send-batch-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ basePayload, phoneNumbers: csvPhoneNumbers, appId, privateKey })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const successCount = data.results.filter(r => r.success).length;
            const failCount = data.results.filter(r => !r.success).length;
            
            if (failCount === 0) {
                showToast(`All ${successCount} messages sent successfully!`, 'success');
            } else {
                showToast(`${successCount} sent, ${failCount} failed.`, 'error');
            }
        } else {
            showToast('Batch send failed: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// Copy JSON
function copyJSON() {
    const json = document.getElementById('jsonPayload').textContent;
    navigator.clipboard.writeText(json).then(() => {
        showToast('JSON copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy JSON', 'error');
    });
}

// Reset form
function resetForm() {
    if (confirm('Are you sure you want to reset the form?')) {
        location.reload();
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// Get message type label
function getMessageTypeLabel(type) {
    const labels = {
        text: 'Text Message',
        image: 'Image Message',
        video: 'Video Message',
        file: 'File Message',
        card: 'Rich Card',
        carousel: 'Carousel'
    };
    return labels[type] || type;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === TEMPLATE MANAGEMENT (Server-side persistent storage) ===

let serverTemplates = [];

// Load templates from server (for VCR persistence)
async function loadTemplatesFromServer() {
    try {
        const response = await fetch('/api/templates');
        const data = await response.json();
        if (data.success) {
            serverTemplates = data.templates || [];
            localStorage.setItem('rcs_templates', JSON.stringify(serverTemplates));
        }
    } catch (error) {
        console.log('Using localStorage templates (server unavailable)');
        serverTemplates = JSON.parse(localStorage.getItem('rcs_templates') || '[]');
    }
}

// Save templates to server
async function saveTemplatesToServer(templates) {
    try {
        await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templates })
        });
    } catch (error) {
        console.error('Failed to save templates to server:', error);
    }
    localStorage.setItem('rcs_templates', JSON.stringify(templates));
}

// Toggle templates section
function toggleTemplates() {
    const section = document.getElementById('templatesSection');
    const btn = document.getElementById('templatesToggleBtn');
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        btn.style.background = '#f5f5f5';
        renderTemplates();
        document.getElementById('templateSearch').value = '';
    } else {
        section.style.display = 'none';
        btn.style.background = '';
    }
}

// Filter templates based on search
function filterTemplates() {
    const searchTerm = document.getElementById('templateSearch').value.toLowerCase();
    
    if (searchTerm === '') {
        renderTemplates();
        return;
    }
    
    const filtered = serverTemplates.filter((template) => {
        const nameMatch = template.name.toLowerCase().includes(searchTerm);
        const typeMatch = getMessageTypeLabel(template.messageType).toLowerCase().includes(searchTerm);
        return nameMatch || typeMatch;
    });
    
    renderTemplates(filtered);
}

// Render templates list
function renderTemplates(filteredTemplates = null) {
    const container = document.getElementById('templatesListDesigner');
    const templates = filteredTemplates || serverTemplates;
    
    if (templates.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">No templates saved yet</div>';
        return;
    }
    
    container.innerHTML = templates.map((template, index) => `
        <div class="template-item" onclick="loadTemplate(${index})">
            <div class="template-info">
                <h4>${escapeHtml(template.name)}</h4>
                <span>${getMessageTypeLabel(template.messageType)} • ${new Date(template.timestamp).toLocaleDateString()}</span>
            </div>
            <div class="template-actions">
                <button class="template-delete" onclick="event.stopPropagation(); deleteTemplate(${index})">🗑️</button>
            </div>
        </div>
    `).join('');
}

// Save current state as template
async function saveAsTemplate() {
    const templateName = prompt('Enter a name for this template:');
    if (!templateName || templateName.trim() === '') {
        showToast('Template name cannot be empty', 'error');
        return;
    }
    
    const payload = buildMessagePayload();
    
    const templateData = {
        name: templateName.trim(),
        messageType: currentMessageType,
        timestamp: new Date().toISOString(),
        uploadedFiles: {},
        carouselCards: [],
        fields: {},
        payload: payload
    };
    
    for (const [key, fileData] of Object.entries(uploadedFiles)) {
        templateData.uploadedFiles[key] = {
            url: fileData.url,
            filename: fileData.filename,
            size: fileData.size,
            mimeType: fileData.mimeType,
            dimensions: fileData.dimensions || null,
            resized: fileData.resized || false
        };
    }
    
    if (currentMessageType === 'carousel') {
        const cardsContainer = document.getElementById('carouselCards');
        if (cardsContainer) {
            cardsContainer.querySelectorAll('.card-builder').forEach((cardEl, index) => {
                templateData.carouselCards.push({
                    title: document.getElementById(`cardTitle${index}`)?.value || '',
                    text: document.getElementById(`cardText${index}`)?.value || '',
                    media_url: document.getElementById(`cardMedia${index}`)?.value || '',
                    media_height: document.getElementById(`cardMediaHeight${index}`)?.value || 'TALL',
                    suggestions: getSuggestions(`suggestions${index}`)
                });
            });
        }
        templateData.fields.carouselCardWidth = document.getElementById('carouselCardWidth')?.value || 'MEDIUM';
    }
    
    if (currentMessageType === 'card') {
        templateData.richCard = {
            title: document.getElementById('cardTitle0')?.value || '',
            text: document.getElementById('cardText0')?.value || '',
            media_url: document.getElementById('cardMedia0')?.value || '',
            media_height: document.getElementById('cardMediaHeight0')?.value || 'TALL',
            orientation: document.getElementById('cardOrientation')?.value || 'VERTICAL',
            alignment: document.getElementById('cardImageAlignment')?.value || 'LEFT',
            suggestions: getSuggestions('suggestions0')
        };
    }
    
    if (currentMessageType === 'text') {
        templateData.suggestions = getSuggestions('suggestions');
        templateData.fields.messageText = document.getElementById('messageText')?.value || '';
    }
    
    ['image', 'video', 'file'].forEach(type => {
        const textEl = document.getElementById(`${type}Text`);
        if (textEl) templateData.fields[`${type}Text`] = textEl.value;
    });
    
    serverTemplates.push(templateData);
    await saveTemplatesToServer(serverTemplates);
    
    showToast('Template saved successfully!', 'success');
    renderTemplates();
}

// Load template
function loadTemplate(index) {
    const template = serverTemplates[index];
    
    if (!template) {
        showToast('Template not found', 'error');
        return;
    }
    
    currentMessageType = template.messageType;
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === currentMessageType) btn.classList.add('active');
    });
    
    uploadedFiles = {};
    if (template.uploadedFiles) {
        for (const [key, fileData] of Object.entries(template.uploadedFiles)) {
            uploadedFiles[key] = fileData;
        }
    }
    
    renderMessageFields();
    
    setTimeout(() => {
        if (template.fields?.messageText) {
            const textEl = document.getElementById('messageText');
            if (textEl) textEl.value = template.fields.messageText;
        }
        
        ['image', 'video', 'file'].forEach(type => {
            if (template.fields?.[`${type}Text`]) {
                const textEl = document.getElementById(`${type}Text`);
                if (textEl) textEl.value = template.fields[`${type}Text`];
            }
            
            if (template.uploadedFiles?.[type]) {
                displayFilePreview(type, template.uploadedFiles[type], {
                    name: template.uploadedFiles[type].filename,
                    size: template.uploadedFiles[type].size || 0
                });
            }
        });
        
        if (template.richCard) {
            document.getElementById('cardTitle0').value = template.richCard.title || '';
            document.getElementById('cardText0').value = template.richCard.text || '';
            document.getElementById('cardMedia0').value = template.richCard.media_url || '';
            document.getElementById('cardMediaHeight0').value = template.richCard.media_height || 'TALL';
            if (document.getElementById('cardOrientation')) {
                document.getElementById('cardOrientation').value = template.richCard.orientation || 'VERTICAL';
            }
            if (document.getElementById('cardImageAlignment')) {
                document.getElementById('cardImageAlignment').value = template.richCard.alignment || 'LEFT';
            }
            if (template.richCard.suggestions) {
                loadSuggestions('suggestions0', template.richCard.suggestions);
            }
        }
        
        if (template.carouselCards && template.carouselCards.length > 0) {
            const container = document.getElementById('carouselCards');
            if (container) {
                container.innerHTML = '';
                template.carouselCards.forEach((cardData, i) => {
                    const card = createCardBuilder(true, i);
                    container.appendChild(card);
                    
                    setTimeout(() => {
                        document.getElementById(`cardTitle${i}`).value = cardData.title || '';
                        document.getElementById(`cardText${i}`).value = cardData.text || '';
                        document.getElementById(`cardMedia${i}`).value = cardData.media_url || '';
                        document.getElementById(`cardMediaHeight${i}`).value = cardData.media_height || 'TALL';
                        if (cardData.suggestions) loadSuggestions(`suggestions${i}`, cardData.suggestions);
                    }, 50);
                });
                
                if (template.fields?.carouselCardWidth) {
                    document.getElementById('carouselCardWidth').value = template.fields.carouselCardWidth;
                }
            }
        }
        
        if (template.suggestions) {
            loadSuggestions('suggestions', template.suggestions);
        }
        
        updatePreview();
    }, 100);
    
    toggleTemplates();
    showToast('Template loaded successfully!', 'success');
}

// Load suggestions into container
function loadSuggestions(containerId, suggestions) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    suggestions.forEach(suggestion => {
        addSuggestion(containerId);
        
        setTimeout(() => {
            const items = container.querySelectorAll('.suggestion-item');
            const item = items[items.length - 1];
            
            if (item) {
                const typeSelect = item.querySelector('.suggestion-type');
                typeSelect.value = suggestion.type;
                toggleSuggestionFields(typeSelect);
                
                item.querySelector('.suggestion-text').value = suggestion.text || '';
                item.querySelector('.suggestion-postback').value = suggestion.postback_data || '';
                
                if (suggestion.type === 'open_url') {
                    item.querySelector('.suggestion-url').value = suggestion.url || '';
                } else if (suggestion.type === 'dial') {
                    item.querySelector('.suggestion-phone').value = suggestion.phone_number || '';
                    item.querySelector('.suggestion-fallback').value = suggestion.fallback_url || '';
                } else if (suggestion.type === 'view_location') {
                    item.querySelector('.suggestion-latitude').value = suggestion.latitude || '';
                    item.querySelector('.suggestion-longitude').value = suggestion.longitude || '';
                    item.querySelector('.suggestion-pinlabel').value = suggestion.label || '';
                    item.querySelector('.suggestion-fallback').value = suggestion.fallback_url || '';
                }
            }
        }, 20);
    });
}

// Delete template
async function deleteTemplate(index) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    serverTemplates.splice(index, 1);
    await saveTemplatesToServer(serverTemplates);
    
    showToast('Template deleted', 'success');
    renderTemplates();
}

// === HELP MODAL ===

function showHelp() {
    document.getElementById('helpModal').classList.add('show');
}

function closeHelp() {
    document.getElementById('helpModal').classList.remove('show');
}

function switchHelpTab(tabName) {
    document.querySelectorAll('.help-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.help-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.help-tab[onclick="switchHelpTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`help-${tabName}`).classList.add('active');
}

// Close modals on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeHelp();
    }
});

// Close modals on backdrop click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});
