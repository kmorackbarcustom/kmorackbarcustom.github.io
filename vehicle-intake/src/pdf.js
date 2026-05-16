import { SHOP_NAME, SHOP_ADDRESS, SHOP_PHONE } from './config.js'

const PDF_IMAGE_TIMEOUT_MS = 8000;

/**
 * Generate PDF for a vehicle intake form
 * @param {Object} data - Record data
 * @param {string} elementId - ID of hidden template element
 */
export async function generateVehicleIntakePDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header
    try {
        const logoData = await getBase64Image('assets/logo.jpg');
        doc.addImage(logoData, 'JPEG', 82, 10, 46, 46);
    } catch (err) {
        console.error('Could not load logo for PDF:', err);
    }

    doc.setFontSize(18);
    doc.text(SHOP_NAME, 105, 64, { align: 'center' });
    doc.setFontSize(14);
    doc.text('ใบรับรถเข้าร้าน', 105, 74, { align: 'center' });
    
    doc.setLineWidth(0.5);
    doc.line(20, 80, 190, 80);

    // Section: Customer Info
    doc.setFontSize(12);
    doc.text('ข้อมูลลูกค้า', 20, 90);
    doc.rect(20, 93, 170, 25);
    doc.text(`ชื่อ: ${data.customer_name}`, 25, 100);
    doc.text(`เบอร์โทร: ${data.customer_phone}`, 110, 100);
    doc.text(`วันที่รับรถ: ${new Date(data.intake_date).toLocaleDateString('th-TH')}`, 25, 110);

    // Section: Vehicle Info
    doc.text('ข้อมูลรถ', 20, 130);
    doc.rect(20, 133, 170, 35);
    doc.text(`ยี่ห้อ: ${data.vehicle_brand}`, 25, 140);
    doc.text(`รุ่น: ${data.vehicle_model}`, 110, 140);
    doc.text(`สี: ${data.vehicle_color || '-'}`, 25, 150);
    doc.text(`ทะเบียน: ${data.license_plate}`, 110, 150);
    doc.text(`เลขไมล์: ${data.mileage || '-'}`, 25, 160);
    doc.text(`VIN: ${data.vin_number || '-'}`, 110, 160);

    // Section: Condition
    doc.text('สภาพรถและรายละเอียด', 20, 180);
    doc.rect(20, 183, 170, 75);
    
    const conditionLines = [
        `ตำหนิรอบคัน: ${data.damage_notes || '-'}`,
        `อะไหล่ติดรถ: ${data.accessories || '-'}`,
        `หมายเหตุ: ${data.note || '-'}`,
        'หมายเหตุเพิ่มเติม: อาจมีการขับไปติดตั้งอุปกรณ์อื่น ๆ เช่น จอแอนดรอย ไฟสปอร์ตไลท์ ที่หน้า shop ไม่เกิน 1-2 กิโลเมตร'
    ];
    
    let y = 190;
    conditionLines.forEach(line => {
        const splitLine = doc.splitTextToSize(line, 160);
        doc.text(splitLine, 25, y);
        y += splitLine.length * 7;
    });

    // Images Section
    if (data.image_urls && data.image_urls.length > 0) {
        doc.addPage();
        doc.text('รูปภาพประกอบ', 20, 20);
        
        let imgY = 30;
        let imgX = 20;
        const imgWidth = 80;
        const imgHeight = 60;
        const margin = 10;

        for (let i = 0; i < data.image_urls.length; i++) {
            try {
                // We use a helper to load image as base64 for jsPDF
                const imgData = await getBase64Image(data.image_urls[i]);
                doc.addImage(imgData, 'JPEG', imgX, imgY, imgWidth, imgHeight);
                
                // Position logic for 2x3 grid
                if (i % 2 === 0) {
                    imgX = 110;
                } else {
                    imgX = 20;
                    imgY += imgHeight + margin;
                }

                // Check for new page
                if (imgY > 250 && i < data.image_urls.length - 1) {
                    doc.addPage();
                    imgY = 20;
                }
            } catch (err) {
                console.error('Could not load image for PDF:', data.image_urls[i]);
            }
        }
    }

    const filename = `ใบรับรถ_${data.license_plate}_${data.intake_date}.pdf`;
    doc.save(filename);
}

/**
 * Convert image URL to Base64
 */
function getBase64Image(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timeoutId = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            reject(new Error(`โหลดรูปเข้า PDF นานเกินไป: ${url}`));
        }, PDF_IMAGE_TIMEOUT_MS);

        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            clearTimeout(timeoutId);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataURL);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error(`โหลดรูปเข้า PDF ไม่สำเร็จ: ${url}`));
        };
        img.src = url;
    });
}
