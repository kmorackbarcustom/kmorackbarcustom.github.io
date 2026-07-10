import { searchIntakeForms, getIntakeFormById, deleteIntakeForm, resolveImageSrc } from './supabase.js'
import { generateVehicleIntakePDF } from './pdf.js'

const historyGrid = document.getElementById('historyGrid');
const searchInput = document.getElementById('searchInput');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const searchBtn = document.getElementById('searchBtn');
const resetSearchBtn = document.getElementById('resetSearchBtn');
const selectAllRecords = document.getElementById('selectAllRecords');
const selectedCount = document.getElementById('selectedCount');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalDetailContent');
const closeBtn = document.querySelector('.close-btn');

let currentRecords = [];
let selectedRecordIds = new Set();
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/300x200?text=No+Image';

function setStatus(message, className = 'loading-state') {
    historyGrid.innerHTML = '';
    selectedRecordIds.clear();
    updateBulkActions();
    const status = document.createElement('div');
    status.className = className;
    status.textContent = message;
    historyGrid.appendChild(status);
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
        selectedRecordIds.clear();
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
        const firstUrl = item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

        const card = document.createElement('div');
        card.className = 'card';

        const selectLabel = document.createElement('label');
        selectLabel.className = 'card-select';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedRecordIds.has(item.id);
        checkbox.onchange = () => {
            if (checkbox.checked) {
                selectedRecordIds.add(item.id);
            } else {
                selectedRecordIds.delete(item.id);
            }
            updateBulkActions();
        };

        const selectText = document.createElement('span');
        selectText.textContent = 'เลือก';
        selectLabel.append(checkbox, selectText);

        const img = document.createElement('img');
        img.src = PLACEHOLDER_IMAGE;
        img.className = 'card-img';
        img.alt = 'Vehicle';
        // ponytail: bucket เป็น private ต้องดึงผ่าน proxy เป็น blob ก่อนถึงจะแสดงได้ (แก้ทีหลัง render เพื่อไม่บล็อก UI)
        if (firstUrl) {
            resolveImageSrc(firstUrl).then(src => { if (src) img.src = src; });
        }

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

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm delete-record';
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'ลบ';
        deleteBtn.onclick = () => handleDelete(item.id);

        actions.append(viewBtn, deleteBtn);
        card.append(selectLabel, img, content, actions);
        historyGrid.appendChild(card);
    });

    updateBulkActions();
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

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger delete-record';
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'ลบรายการนี้';
        deleteBtn.onclick = () => handleDelete(record.id, { closeModal: true });

        const detailActions = document.createElement('div');
        detailActions.className = 'detail-actions';
        detailActions.append(downloadBtn, deleteBtn);

        header.append(heading, detailActions);

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
            const item = document.createElement('div');
            item.className = 'preview-item';

            const img = document.createElement('img');
            img.src = PLACEHOLDER_IMAGE;
            img.alt = 'vehicle';

            // ponytail: bucket เป็น private ต้องดึงผ่าน proxy เป็น blob ก่อนแสดง/เปิดดูรูปเต็ม
            resolveImageSrc(url).then(src => {
                if (!src) return;
                img.src = src;
                img.onclick = () => window.open(src, '_blank', 'noopener');
            });

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

function updateBulkActions() {
    const selectedTotal = selectedRecordIds.size;
    selectedCount.textContent = `เลือก ${selectedTotal} รายการ`;
    deleteSelectedBtn.disabled = selectedTotal === 0;

    if (currentRecords.length === 0) {
        selectAllRecords.checked = false;
        selectAllRecords.indeterminate = false;
        selectAllRecords.disabled = true;
        return;
    }

    selectAllRecords.disabled = false;
    selectAllRecords.checked = selectedTotal > 0 && selectedTotal === currentRecords.length;
    selectAllRecords.indeterminate = selectedTotal > 0 && selectedTotal < currentRecords.length;
}

async function handleDelete(id, { closeModal = false } = {}) {
    const record = currentRecords.find(item => item.id === id) || await getIntakeFormById(id);
    const label = `${record.license_plate || '-'} - ${record.customer_name || '-'}`;

    if (!confirm(`ลบประวัติใบรับรถนี้หรือไม่?\n\n${label}\n\nระบบจะลบทั้งข้อมูลในฐานข้อมูลและรูปภาพที่แนบไว้`)) {
        return;
    }

    try {
        setDeleteLoading(true);
        await deleteIntakeForm(id);
        selectedRecordIds.delete(id);

        if (closeModal) {
            detailModal.style.display = 'none';
        }

        await loadHistory();
        alert('ลบข้อมูลและรูปภาพเรียบร้อยแล้ว');
    } catch (err) {
        alert('ลบไม่สำเร็จ: ' + err.message);
    } finally {
        setDeleteLoading(false);
    }
}

async function handleDeleteSelected() {
    const ids = Array.from(selectedRecordIds);
    if (ids.length === 0) return;

    if (!confirm(`ลบประวัติที่เลือก ${ids.length} รายการหรือไม่?\n\nระบบจะลบทั้งข้อมูลในฐานข้อมูลและรูปภาพที่แนบไว้`)) {
        return;
    }

    try {
        setDeleteLoading(true);
        for (const id of ids) {
            await deleteIntakeForm(id);
        }

        selectedRecordIds.clear();
        await loadHistory();
        alert(`ลบข้อมูล ${ids.length} รายการเรียบร้อยแล้ว`);
    } catch (err) {
        alert('ลบไม่สำเร็จ: ' + err.message);
        await loadHistory();
    } finally {
        setDeleteLoading(false);
    }
}

function setDeleteLoading(isLoading) {
    deleteSelectedBtn.disabled = isLoading || selectedRecordIds.size === 0;
    deleteSelectedBtn.textContent = isLoading ? 'กำลังลบ...' : 'ลบรายการที่เลือก';

    document.querySelectorAll('.btn-danger').forEach(btn => {
        btn.disabled = isLoading;
    });
}

searchBtn.onclick = loadHistory;
resetSearchBtn.onclick = () => {
    searchInput.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    loadHistory();
};

selectAllRecords.onchange = () => {
    if (selectAllRecords.checked) {
        selectedRecordIds = new Set(currentRecords.map(item => item.id));
    } else {
        selectedRecordIds.clear();
    }
    renderHistory(currentRecords);
};

deleteSelectedBtn.onclick = handleDeleteSelected;

closeBtn.onclick = () => {
    detailModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target == detailModal) {
        detailModal.style.display = 'none';
    }
};
