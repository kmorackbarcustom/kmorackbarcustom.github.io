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

const IMAGE_PROCESS_TIMEOUT_MS = 15000;
const HEIC_EXTENSIONS = ['.heic', '.heif'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function withTimeout(promise, ms, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// Initialize date input with today's date
document.getElementById('intake_date').valueAsDate = new Date();

// Handle image selection
imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);

    for (const file of files) {
        if (!isSupportedImage(file)) {
            alert(`ไฟล์ ${file.name} ไม่รองรับ กรุณาใช้ JPG, PNG, WEBP, HEIC หรือ HEIF เท่านั้น`);
            continue;
        }

        try {
            const normalizedFile = await normalizeImageFile(file);
            const preview = await readFileAsDataUrl(normalizedFile);
            const id = Math.random().toString(36).substr(2, 9);
            selectedFiles.push({ id, file: normalizedFile, originalName: file.name, preview });
            renderPreviews();
        } catch (err) {
            console.error('Image selection failed:', err);
            alert(`รูป ${file.name} ใช้งานไม่ได้: ${err.message}`);
        }
    }

    imageInput.value = '';
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

function isHeicFile(file) {
    const name = file.name.toLowerCase();
    return HEIC_EXTENSIONS.some(ext => name.endsWith(ext)) || ['image/heic', 'image/heif'].includes(file.type);
}

function isSupportedImage(file) {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) return false;
    if (ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) return true;
    return isHeicFile(file) && !file.type;
}

async function normalizeImageFile(file) {
    if (!isHeicFile(file)) return file;

    if (typeof window.heic2any !== 'function') {
        throw new Error('ระบบแปลง HEIC ยังโหลดไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่');
    }

    const converted = await withTimeout(
        window.heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.86
        }),
        IMAGE_PROCESS_TIMEOUT_MS,
        `แปลงไฟล์ HEIC ${file.name} นานเกินไป`
    );

    const blob = Array.isArray(converted) ? converted[0] : converted;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], newName, { type: 'image/jpeg' });
}

function readFileAsDataUrl(file) {
    return withTimeout(new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsDataURL(file);
    }), IMAGE_PROCESS_TIMEOUT_MS, `อ่านไฟล์รูป ${file.name} นานเกินไป`);
}

/**
 * Compress image before upload
 */
async function compressImage(file) {
    return withTimeout(new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`อ่านไฟล์รูป ${file.name} ไม่สำเร็จ`));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error(`รูป ${file.name} เปิดอ่านไม่ได้ อาจเป็นไฟล์ HEIC/ไฟล์เสีย`));
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
                    if (!blob) {
                        reject(new Error(`บีบอัดรูป ${file.name} ไม่สำเร็จ`));
                        return;
                    }
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.8);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }), IMAGE_PROCESS_TIMEOUT_MS, `ประมวลผลรูป ${file.name} นานเกินไป กรุณาลองใช้รูป JPG/PNG`);
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
                if (compressed.size > MAX_UPLOAD_BYTES) {
                    throw new Error(`รูป ${item.originalName} ใหญ่เกิน 5MB หลังบีบอัด กรุณาใช้รูปที่เล็กลง`);
                }
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

        // 3. Show Success before PDF generation so the UI never spins forever.
        showSuccess();

        // 4. Generate PDF
        try {
            await withTimeout(
                generateVehicleIntakePDF(savedRecord),
                20000,
                'สร้าง PDF นานเกินไป กรุณากดดาวน์โหลด PDF อีกครั้งจากหน้าต่างสำเร็จ'
            );
        } catch (pdfErr) {
            console.error('PDF generation failed:', pdfErr);
            alert('บันทึกข้อมูลสำเร็จแล้ว แต่สร้าง PDF อัตโนมัติไม่สำเร็จ: ' + pdfErr.message);
        }
        
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
    if (lastSavedData) {
        generateVehicleIntakePDF(lastSavedData).catch(err => {
            console.error('PDF download failed:', err);
            alert('สร้าง PDF ไม่สำเร็จ: ' + err.message);
        });
    }
};

window.onclick = (event) => {
    if (event.target == successModal) {
        successModal.style.display = 'none';
    }
};
