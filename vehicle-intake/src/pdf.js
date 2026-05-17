import { SHOP_NAME } from './config.js'

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_RENDER_TIMEOUT_MS = 20000;

/**
 * Generate PDF for a vehicle intake form.
 * Thai text is rendered through browser HTML/canvas first because jsPDF's
 * default text renderer does not handle Thai fonts reliably.
 */
export async function generateVehicleIntakePDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pages = buildPdfPages(data);

    document.body.appendChild(pages);

    try {
        await waitForPdfAssets(pages);
        const pageElements = Array.from(pages.querySelectorAll('.pdf-page'));

        for (let i = 0; i < pageElements.length; i++) {
            const canvas = await renderPageToCanvas(pageElements[i]);
            const imageData = canvas.toDataURL('image/jpeg', 0.95);

            if (i > 0) doc.addPage();
            doc.addImage(imageData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
        }

        const filename = `ใบรับรถ_${sanitizeFilename(data.license_plate)}_${data.intake_date}.pdf`;
        doc.save(filename);
    } finally {
        pages.remove();
    }
}

function buildPdfPages(data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-render-root';
    wrapper.style.cssText = [
        'position: fixed',
        'left: -10000px',
        'top: 0',
        'width: 794px',
        'background: #ffffff',
        'z-index: -1',
        'font-family: Prompt, Arial, sans-serif'
    ].join(';');

    wrapper.appendChild(buildInfoPage(data));

    const imageUrls = Array.isArray(data.image_urls) ? data.image_urls : [];
    if (imageUrls.length > 0) {
        wrapper.appendChild(buildImagesPage(imageUrls));
    }

    return wrapper;
}

function buildInfoPage(data) {
    const page = createPdfPage();
    page.innerHTML = `
        <style>${pdfStyles()}</style>
        <div class="pdf-header">
            <img class="pdf-logo" src="assets/logo.jpg" alt="KMO logo">
            <h1>${escapeHtml(SHOP_NAME)}</h1>
            <h2>ใบรับรถเข้าร้าน</h2>
        </div>

        <section class="pdf-section">
            <h3>ข้อมูลลูกค้า</h3>
            <div class="pdf-grid">
                ${fieldHtml('ชื่อลูกค้า', data.customer_name)}
                ${fieldHtml('เบอร์โทร', data.customer_phone)}
                ${fieldHtml('วันที่รับรถ', formatThaiDate(data.intake_date))}
            </div>
        </section>

        <section class="pdf-section">
            <h3>ข้อมูลรถ</h3>
            <div class="pdf-grid two">
                ${fieldHtml('ยี่ห้อ', data.vehicle_brand)}
                ${fieldHtml('รุ่น', data.vehicle_model)}
                ${fieldHtml('สี', data.vehicle_color)}
                ${fieldHtml('ทะเบียน', data.license_plate)}
                ${fieldHtml('เลขไมล์', data.mileage)}
                ${fieldHtml('เลขตัวถัง (VIN)', data.vin_number)}
            </div>
        </section>

        <section class="pdf-section detail">
            <h3>สภาพรถและรายละเอียด</h3>
            ${fieldHtml('ตำหนิรอบคัน', data.damage_notes, true)}
            ${fieldHtml('อะไหล่/ของติดรถ', data.accessories, true)}
            ${fieldHtml('หมายเหตุ', data.note, true)}
        </section>

        <div class="pdf-notice">
            หมายเหตุ: อาจมีการขับไปติดตั้งอุปกรณ์อื่น ๆ เช่น จอแอนดรอย ไฟสปอร์ตไลท์ ที่หน้า shop ไม่เกิน 1-2 กิโลเมตร
        </div>

        <div class="pdf-signatures">
            <div>ผู้ส่งมอบรถ<br><span></span></div>
            <div>ผู้รับรถ<br><span></span></div>
        </div>
    `;

    return page;
}

function buildImagesPage(imageUrls) {
    const page = createPdfPage();
    const images = imageUrls.map(url => `
        <div class="pdf-photo">
            <img src="${escapeAttribute(url)}" alt="รูปภาพสภาพรถ" crossorigin="anonymous">
        </div>
    `).join('');

    page.innerHTML = `
        <style>${pdfStyles()}</style>
        <h2 class="pdf-image-title">รูปภาพสภาพรถ</h2>
        <div class="pdf-photo-grid">${images}</div>
    `;

    return page;
}

function createPdfPage() {
    const page = document.createElement('div');
    page.className = 'pdf-page';
    page.style.cssText = [
        'width: 794px',
        'min-height: 1123px',
        'background: #ffffff',
        'color: #1f2937',
        'box-sizing: border-box',
        'padding: 44px 54px',
        'overflow: hidden'
    ].join(';');
    return page;
}

function pdfStyles() {
    return `
        * { box-sizing: border-box; }
        .pdf-header { text-align: center; border-bottom: 3px solid #b8860b; padding-bottom: 18px; margin-bottom: 26px; }
        .pdf-logo { width: 120px; height: 120px; object-fit: contain; background: #000; display: block; margin: 0 auto 12px; }
        .pdf-header h1 { margin: 0; color: #b8860b; font-size: 26px; line-height: 1.25; font-weight: 700; }
        .pdf-header h2 { margin: 8px 0 0; color: #374151; font-size: 21px; line-height: 1.35; font-weight: 600; }
        .pdf-section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 18px; margin-bottom: 18px; }
        .pdf-section h3 { margin: 0 0 12px; color: #b8860b; font-size: 18px; line-height: 1.35; font-weight: 700; }
        .pdf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 18px; }
        .pdf-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-field { min-width: 0; font-size: 15px; line-height: 1.55; }
        .pdf-label { display: block; color: #6b7280; font-size: 12px; line-height: 1.35; margin-bottom: 2px; }
        .pdf-value { white-space: pre-wrap; overflow-wrap: anywhere; color: #111827; }
        .pdf-section.detail .pdf-field { margin-bottom: 10px; }
        .pdf-notice { margin-top: 20px; border: 1px solid #facc15; border-left: 5px solid #b8860b; border-radius: 8px; background: #fffbeb; padding: 14px 16px; font-size: 15px; line-height: 1.7; color: #374151; }
        .pdf-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 64px; text-align: center; font-size: 15px; color: #374151; }
        .pdf-signatures span { display: block; height: 44px; border-bottom: 1px solid #9ca3af; margin-top: 20px; }
        .pdf-image-title { margin: 0 0 22px; color: #b8860b; text-align: center; font-size: 24px; line-height: 1.35; }
        .pdf-photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
        .pdf-photo { height: 238px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #f9fafb; }
        .pdf-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    `;
}

function fieldHtml(label, value, multiline = false) {
    const normalized = value === undefined || value === null || value === '' ? '-' : String(value);
    return `
        <div class="pdf-field ${multiline ? 'multiline' : ''}">
            <span class="pdf-label">${escapeHtml(label)}</span>
            <div class="pdf-value">${escapeHtml(normalized)}</div>
        </div>
    `;
}

function formatThaiDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('th-TH');
}

async function waitForPdfAssets(root) {
    const images = Array.from(root.querySelectorAll('img'));
    const imagePromises = images.map(img => waitForImage(img).catch(err => {
        console.error('Could not load image for PDF:', img.src, err);
        img.closest('.pdf-photo')?.remove();
    }));

    const fontPromise = document.fonts ? document.fonts.ready.catch(() => undefined) : Promise.resolve();
    await withTimeout(Promise.all([...imagePromises, fontPromise]), PDF_RENDER_TIMEOUT_MS, 'โหลดข้อมูลสำหรับ PDF นานเกินไป');
}

function waitForImage(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('image timeout'));
        }, 8000);

        const cleanup = () => {
            clearTimeout(timeoutId);
            img.onload = null;
            img.onerror = null;
        };

        img.onload = () => {
            cleanup();
            resolve();
        };

        img.onerror = () => {
            cleanup();
            reject(new Error('image failed'));
        };
    });
}

function renderPageToCanvas(page) {
    return withTimeout(window.html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        imageTimeout: 8000,
        logging: false
    }), PDF_RENDER_TIMEOUT_MS, 'สร้างภาพสำหรับ PDF นานเกินไป');
}

function withTimeout(promise, ms, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function sanitizeFilename(value) {
    return String(value || 'vehicle').replace(/[\\/:*?"<>|]+/g, '_');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}
