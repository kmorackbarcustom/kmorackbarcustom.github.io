import { searchIntakeForms, getIntakeFormById } from './supabase.js'
import { generateVehicleIntakePDF } from './pdf.js'

const historyGrid = document.getElementById('historyGrid');
const searchInput = document.getElementById('searchInput');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const searchBtn = document.getElementById('searchBtn');
const resetSearchBtn = document.getElementById('resetSearchBtn');
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalDetailContent');
const closeBtn = document.querySelector('.close-btn');

let currentRecords = [];
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/300x200?text=No+Image';

function setStatus(message, className = 'loading-state') {
    historyGrid.innerHTML = '';
    const status = document.createElement('div');
    status.className = className;
    status.textContent = message;
    historyGrid.appendChild(status);
}

function safeImageUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.href;
        }
    } catch (err) {
        return PLACEHOLDER_IMAGE;
    }
    return PLACEHOLDER_IMAGE;
}

function appendField(parent, label, value) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.append(strong, document.createTextNode(value || '-'));
    parent.appendChild(p);
}

// Initial Load
loadHistory();

async function loadHistory() {
    try {
        setStatus('กำลังโหลดข้อมูล...');
        const data = await searchIntakeForms({
            query: searchInput.value,
            dateFrom: dateFrom.value,
            dateTo: dateTo.value
        });
        currentRecords = data;
        renderHistory(data);
    } catch (err) {
        setStatus('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
}

function renderHistory(records) {
    if (records.length === 0) {
        setStatus('ไม่พบข้อมูล');
        return;
    }

    historyGrid.innerHTML = '';
    records.forEach(item => {
        const firstImg = item.image_urls && item.image_urls.length > 0 ? safeImageUrl(item.image_urls[0]) : PLACEHOLDER_IMAGE;
        
        const card = document.createElement('div');
        card.className = 'card';

        const img = document.createElement('img');
        img.src = firstImg;
        img.className = 'card-img';
        img.alt = 'Vehicle';

        const content = document.createElement('div');
        content.className = 'card-content';

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = `${item.license_plate} - ${item.vehicle_brand} ${item.vehicle_model}`;

        const customer = document.createElement('div');
        customer.className = 'card-info';
        customer.textContent = `ลูกค้า: ${item.customer_name}`;

        const phone = document.createElement('div');
        phone.className = 'card-info';
        phone.textContent = `เบอร์: ${item.customer_phone}`;

        const date = document.createElement('div');
        date.className = 'card-info';
        date.textContent = `วันที่: ${new Date(item.intake_date).toLocaleDateString('th-TH')}`;

        content.append(title, customer, phone, date);

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-secondary btn-sm';
        viewBtn.type = 'button';
        viewBtn.textContent = 'รายละเอียด';
        viewBtn.onclick = () => openDetail(item.id);

        actions.appendChild(viewBtn);
        card.append(img, content, actions);
        historyGrid.appendChild(card);
    });
}

async function openDetail(id) {
    try {
        const record = await getIntakeFormById(id);
        modalContent.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'detail-header';

        const heading = document.createElement('h2');
        heading.textContent = `รายละเอียดใบรับรถ: ${record.license_plate}`;

        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'downloadPdfModal';
        downloadBtn.className = 'btn btn-primary';
        downloadBtn.type = 'button';
        downloadBtn.textContent = 'ดาวน์โหลด PDF';
        downloadBtn.onclick = () => generateVehicleIntakePDF(record);

        header.append(heading, downloadBtn);

        const hr = document.createElement('hr');
        const grid = document.createElement('div');
        grid.className = 'grid';

        const customerInfo = document.createElement('div');
        appendField(customerInfo, 'ชื่อลูกค้า', record.customer_name);
        appendField(customerInfo, 'เบอร์โทร', record.customer_phone);
        appendField(customerInfo, 'วันที่รับรถ', new Date(record.intake_date).toLocaleDateString('th-TH'));

        const vehicleInfo = document.createElement('div');
        appendField(vehicleInfo, 'ยี่ห้อ/รุ่น', `${record.vehicle_brand} ${record.vehicle_model}`);
        appendField(vehicleInfo, 'สี', record.vehicle_color);
        appendField(vehicleInfo, 'เลขไมล์', record.mileage);
        appendField(vehicleInfo, 'เลขตัวถัง', record.vin_number);

        grid.append(customerInfo, vehicleInfo);

        const detailSection = document.createElement('div');
        detailSection.className = 'detail-section';
        appendField(detailSection, 'ตำหนิรอบคัน', record.damage_notes);
        appendField(detailSection, 'อะไหล่ติดรถ', record.accessories);
        appendField(detailSection, 'หมายเหตุ', record.note);

        const gallery = document.createElement('div');
        gallery.className = 'image-gallery';

        const galleryHeading = document.createElement('h3');
        galleryHeading.textContent = 'รูปภาพ';

        const imageGrid = document.createElement('div');
        imageGrid.className = 'image-preview-grid';

        (record.image_urls || []).forEach(url => {
            const safeUrl = safeImageUrl(url);
            const item = document.createElement('div');
            item.className = 'preview-item';

            const img = document.createElement('img');
            img.src = safeUrl;
            img.alt = 'vehicle';
            img.onclick = () => window.open(safeUrl, '_blank', 'noopener');

            item.appendChild(img);
            imageGrid.appendChild(item);
        });

        gallery.append(galleryHeading, imageGrid);
        modalContent.append(header, hr, grid, detailSection, gallery);
        detailModal.style.display = 'block';
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
}

searchBtn.onclick = loadHistory;
resetSearchBtn.onclick = () => {
    searchInput.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    loadHistory();
};

closeBtn.onclick = () => {
    detailModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target == detailModal) {
        detailModal.style.display = 'none';
    }
};
