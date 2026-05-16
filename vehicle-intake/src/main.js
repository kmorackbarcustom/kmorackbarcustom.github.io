import { uploadImage, deleteImage, createIntakeForm } from './supabase.js'
import { generateVehicleIntakePDF } from './pdf.js'

const form = document.getElementById('intakeForm');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const submitBtn = document.getElementById('submitBtn');
const successModal = document.getElementById('successModal');
const closeModal = document.getElementById('closeModal');
const downloadPdfAgain = document.getElementById('downloadPdfAgain');

let selectedFiles = [];
let lastSavedData = null;

// Initialize date input with today's date
document.getElementById('intake_date').valueAsDate = new Date();

// Handle image selection
imageInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const id = Math.random().toString(36).substr(2, 9);
            selectedFiles.push({ id, file, preview: event.target.result });
            renderPreviews();
        };
        reader.readAsDataURL(file);
    });
});

function renderPreviews() {
    imagePreview.innerHTML = '';
    selectedFiles.forEach(item => {
        const div = document.createElement('div');
        div.className = 'preview-item';

        const img = document.createElement('img');
        img.src = item.preview;
        img.alt = 'preview';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-img';
        removeBtn.dataset.id = item.id;
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            selectedFiles = selectedFiles.filter(f => f.id !== item.id);
            renderPreviews();
        };

        div.append(img, removeBtn);
        imagePreview.appendChild(div);
    });
}

/**
 * Compress image before upload
 */
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1920;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.8);
            };
        };
    });
}

// Form Submission
form.onsubmit = async (e) => {
    e.preventDefault();
    
    if (submitBtn.disabled) return;
    
    try {
        setLoading(true);
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // 1. Upload Images
        let imageUrls = [];
        let savedRecord = null;

        try {
            const uploadPromises = selectedFiles.map(async (item) => {
                const compressed = await compressImage(item.file);
                return uploadImage(compressed, data.license_plate);
            });

            imageUrls = await Promise.all(uploadPromises);
            data.image_urls = imageUrls;

            // 2. Save to Supabase
            savedRecord = await createIntakeForm(data);
        } catch (err) {
            await Promise.allSettled(imageUrls.map(url => deleteImage(url)));
            throw err;
        }

        lastSavedData = savedRecord;

        // 3. Generate PDF
        await generateVehicleIntakePDF(savedRecord);

        // 4. Show Success
        showSuccess();
        
    } catch (err) {
        console.error('Error saving:', err);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    } finally {
        setLoading(false);
    }
};

function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading ? '<div class="spinner"></div> กำลังบันทึก...' : 'บันทึกและสร้าง PDF';
}

function showSuccess() {
    successModal.style.display = 'block';
}

closeModal.onclick = () => {
    successModal.style.display = 'none';
    form.reset();
    selectedFiles = [];
    renderPreviews();
    document.getElementById('intake_date').valueAsDate = new Date();
};

downloadPdfAgain.onclick = () => {
    if (lastSavedData) generateVehicleIntakePDF(lastSavedData);
};

window.onclick = (event) => {
    if (event.target == successModal) {
        successModal.style.display = 'none';
    }
};
